import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Auth is mocked at the user lookup; Mongo is replaced by spies on the Zap model so the tests can
// assert the exact queries, in particular that every lookup is scoped to the signed-in owner.
vi.mock('../src/modules/users/users.service.js', () => ({ findUserById: vi.fn() }));
vi.mock('../src/modules/hooks/hooks.service.js', () => ({ ensureHook: vi.fn() }));

const { buildApp } = await import('../src/app.js');
const { signSession } = await import('../src/lib/session.js');
const users = await import('../src/modules/users/users.service.js');
const { ZapModel } = await import('../src/models/zap.model.js');
const hooks = await import('../src/modules/hooks/hooks.service.js');
const { HttpError } = await import('../src/lib/http-error.js');

const ALICE = { id: new Types.ObjectId().toString(), githubId: 1, login: 'alice', name: null, avatarUrl: null, tokenStatus: 'valid' as const };

const body = () => ({
  name: 'Thank PR authors',
  trigger: { app: 'github', event: 'pull_request.opened', config: { repoFullName: 'alice/zap-test' } },
  action: { app: 'github', type: 'pull_request.comment', fields: { body: 'Thanks @{{pr.author}}!' } },
});

function fakeDoc(owner: string, overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const _id = new Types.ObjectId();
  const data: Record<string, unknown> = {
    _id,
    owner: new Types.ObjectId(owner),
    ...body(),
    enabled: false,
    source: 'manual',
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  const doc = {
    _id,
    toObject: () => ({ ...data }),
    set: (patch: Record<string, unknown>) => Object.assign(data, patch),
    markModified: vi.fn(),
    save: vi.fn(async () => doc),
  };
  return doc;
}

describe('Zaps API', () => {
  const app = buildApp();
  let cookie: string;

  beforeEach(async () => {
    vi.mocked(users.findUserById).mockResolvedValue(ALICE);
    cookie = `zap_session=${await signSession(ALICE.id)}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(hooks.ensureHook).mockReset();
  });

  it('requires a session', async () => {
    const res = await request(app).get('/api/zaps');
    expect(res.status).toBe(401);
  });

  it('lists only the signed-in user\'s Zaps', async () => {
    const lean = vi.fn().mockResolvedValue([fakeDoc(ALICE.id).toObject()]);
    const sort = vi.fn().mockReturnValue({ lean });
    const find = vi.spyOn(ZapModel, 'find').mockReturnValue({ sort } as never);

    const res = await request(app).get('/api/zaps').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(find).toHaveBeenCalledWith({ owner: ALICE.id });
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ name: 'Thank PR authors', enabled: false, lastRunStatus: null });
    expect(res.body[0].owner).toBeUndefined();
  });

  it('creates a Zap owned by the caller, off by default', async () => {
    const create = vi
      .spyOn(ZapModel, 'create')
      .mockImplementation(async (input: unknown) => fakeDoc(ALICE.id, input as Record<string, unknown>) as never);

    const res = await request(app).post('/api/zaps').set('Cookie', cookie).send(body());
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ owner: ALICE.id, enabled: false, source: 'manual' }));
    expect(res.body).toMatchObject({ name: 'Thank PR authors', enabled: false });
    expect(hooks.ensureHook).not.toHaveBeenCalled();
  });

  it('installs the webhook before creating an enabled Zap', async () => {
    const create = vi
      .spyOn(ZapModel, 'create')
      .mockImplementation(async (input: unknown) => fakeDoc(ALICE.id, input as Record<string, unknown>) as never);
    const res = await request(app).post('/api/zaps').set('Cookie', cookie).send({ ...body(), enabled: true });
    expect(res.status).toBe(201);
    expect(hooks.ensureHook).toHaveBeenCalledWith(ALICE.id, 'alice/zap-test');
    expect(create).toHaveBeenCalled();
  });

  it('does not save an enabled Zap when the webhook cannot be installed', async () => {
    vi.mocked(hooks.ensureHook).mockRejectedValue(
      new HttpError(422, 'hook_install_failed', "Can't install the webhook on alice/zap-test."),
    );
    const create = vi.spyOn(ZapModel, 'create');
    const res = await request(app).post('/api/zaps').set('Cookie', cookie).send({ ...body(), enabled: true });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('hook_install_failed');
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses to let the client set the owner', async () => {
    const create = vi.spyOn(ZapModel, 'create');
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', cookie)
      .send({ ...body(), owner: new Types.ObjectId().toString() });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(create).not.toHaveBeenCalled();
  });

  it('returns field-level errors for an invalid Zap', async () => {
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', cookie)
      .send({ ...body(), name: '', action: { app: 'slack', type: 'message.send', fields: {} } });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toContain('name');
  });

  it('rejects coming-soon apps with a catalog error', async () => {
    const res = await request(app)
      .post('/api/zaps')
      .set('Cookie', cookie)
      .send({ ...body(), action: { app: 'slack', type: 'message.send', fields: {} } });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { path: 'action.app', message: "Slack is coming soon and can't be used yet" },
    ]);
  });

  it('scopes single-Zap lookups to the owner and 404s otherwise', async () => {
    const findOne = vi.spyOn(ZapModel, 'findOne').mockResolvedValue(null);
    const id = new Types.ObjectId().toString();

    const res = await request(app).get(`/api/zaps/${id}`).set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('zap_not_found');
    expect(findOne).toHaveBeenCalledWith({ _id: id, owner: ALICE.id });

    const patch = await request(app).patch(`/api/zaps/${id}`).set('Cookie', cookie).send({ enabled: true });
    expect(patch.status).toBe(404);
  });

  it('returns 404 for a malformed id without querying', async () => {
    const findOne = vi.spyOn(ZapModel, 'findOne');
    const res = await request(app).get('/api/zaps/not-an-id').set('Cookie', cookie);
    expect(res.status).toBe(404);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('toggles a Zap on', async () => {
    const doc = fakeDoc(ALICE.id);
    vi.spyOn(ZapModel, 'findOne').mockResolvedValue(doc as never);

    const res = await request(app).patch(`/api/zaps/${doc._id}`).set('Cookie', cookie).send({ enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(doc.save).toHaveBeenCalled();
    expect(hooks.ensureHook).toHaveBeenCalledWith(ALICE.id, 'alice/zap-test');
  });

  it('leaves the Zap off when turning it on fails at GitHub', async () => {
    const doc = fakeDoc(ALICE.id);
    vi.spyOn(ZapModel, 'findOne').mockResolvedValue(doc as never);
    vi.mocked(hooks.ensureHook).mockRejectedValue(new HttpError(422, 'hook_install_failed', 'no admin'));
    const res = await request(app).patch(`/api/zaps/${doc._id}`).set('Cookie', cookie).send({ enabled: true });
    expect(res.status).toBe(422);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('does not touch GitHub when turning a Zap off', async () => {
    const doc = fakeDoc(ALICE.id, { enabled: true });
    vi.spyOn(ZapModel, 'findOne').mockResolvedValue(doc as never);
    const res = await request(app).patch(`/api/zaps/${doc._id}`).set('Cookie', cookie).send({ enabled: false });
    expect(res.status).toBe(200);
    expect(hooks.ensureHook).not.toHaveBeenCalled();
  });

  it('validates the merged Zap on edit', async () => {
    const doc = fakeDoc(ALICE.id);
    vi.spyOn(ZapModel, 'findOne').mockResolvedValue(doc as never);

    const res = await request(app)
      .patch(`/api/zaps/${doc._id}`)
      .set('Cookie', cookie)
      .send({ action: { app: 'github', type: 'pull_request.comment', fields: { body: '{{nope}}' } } });
    expect(res.status).toBe(400);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('rejects an empty patch', async () => {
    const res = await request(app).patch(`/api/zaps/${new Types.ObjectId()}`).set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });

  it('serves the catalog with GitHub available and placeholders marked', async () => {
    const res = await request(app).get('/api/catalog').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.map((a: { id: string; available: boolean }) => [a.id, a.available]));
    expect(byId).toMatchObject({ github: true, gitlab: false, slack: false });
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });
});
