import { createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/hooks/hooks.service.js', () => ({ findHookById: vi.fn(), ensureHook: vi.fn() }));
vi.mock('../src/modules/engine/run-zap.js', () => ({ runMatchedZaps: vi.fn().mockResolvedValue([]) }));

const { buildApp } = await import('../src/app.js');
const hooks = await import('../src/modules/hooks/hooks.service.js');
const { ZapModel } = await import('../src/models/zap.model.js');
const engine = await import('../src/modules/engine/run-zap.js');

const SECRET = 'test-webhook-secret-0123456789';
const OWNER = new Types.ObjectId();

const prOpened = (action = 'opened') => ({
  action,
  number: 7,
  pull_request: {
    number: 7,
    title: 'Add feature',
    html_url: 'https://github.com/alice/zap-test/pull/7',
    user: { login: 'bob' },
    head: { ref: 'feature' },
    base: { ref: 'main' },
  },
  repository: { full_name: 'alice/zap-test', name: 'zap-test' },
});

function deliver(event: string, payload: unknown, { secret = SECRET, hookId = 123 } = {}) {
  const raw = JSON.stringify(payload);
  const sig = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  return request(buildApp())
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', event)
    .set('X-GitHub-Delivery', 'd-1')
    .set('X-GitHub-Hook-ID', String(hookId))
    .set('X-Hub-Signature-256', sig)
    .send(raw);
}

describe('POST /api/webhooks/github', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(hooks.findHookById).mockReset();
    vi.mocked(engine.runMatchedZaps).mockClear();
  });

  it('rejects a delivery signed with another secret', async () => {
    const res = await deliver('pull_request', prOpened(), { secret: 'not-the-secret' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_signature');
    expect(hooks.findHookById).not.toHaveBeenCalled();
  });

  it('rejects an unsigned delivery', async () => {
    const res = await request(buildApp())
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .send(JSON.stringify(prOpened()));
    expect(res.status).toBe(401);
  });

  it('answers the ping GitHub sends when the hook is created', async () => {
    const res = await deliver('ping', { zen: 'Keep it logically awesome.', hook_id: 123 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('ignores other events and other pull_request actions', async () => {
    expect((await deliver('push', { ref: 'refs/heads/main' })).status).toBe(204);
    expect((await deliver('pull_request', prOpened('closed'))).status).toBe(204);
    expect(hooks.findHookById).not.toHaveBeenCalled();
  });

  it('matches only the hook owner\'s enabled Zaps for this trigger and repo', async () => {
    vi.mocked(hooks.findHookById).mockResolvedValue({
      _id: new Types.ObjectId(),
      owner: OWNER,
      repoFullName: 'alice/zap-test',
      hookId: 123,
      url: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const matched = [{ _id: new Types.ObjectId() }, { _id: new Types.ObjectId() }];
    const lean = vi.fn().mockResolvedValue(matched);
    const find = vi.spyOn(ZapModel, 'find').mockReturnValue({ lean } as never);

    const res = await deliver('pull_request', prOpened());
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ delivery: 'd-1', matched: 2 });
    expect(hooks.findHookById).toHaveBeenCalledWith(123);
    expect(find).toHaveBeenCalledWith({
      owner: OWNER,
      enabled: true,
      'trigger.key': 'github:pull_request.opened',
      'trigger.config.repoFullName': 'alice/zap-test',
    });
    // Runs start after the 202 is sent, with the delivery id for idempotency.
    expect(engine.runMatchedZaps).toHaveBeenCalledWith(matched, 'd-1', expect.objectContaining({ number: 7 }));
  });

  it('accepts but runs nothing for an unknown hook id', async () => {
    vi.mocked(hooks.findHookById).mockResolvedValue(null);
    const find = vi.spyOn(ZapModel, 'find');
    const res = await deliver('pull_request', prOpened(), { hookId: 999 });
    expect(res.status).toBe(202);
    expect(res.body.matched).toBe(0);
    expect(find).not.toHaveBeenCalled();
    expect(engine.runMatchedZaps).not.toHaveBeenCalled();
  });

  it('returns 400 for a correctly signed body that is not JSON', async () => {
    const raw = '{not json';
    const sig = `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`;
    const res = await request(buildApp())
      .post('/api/webhooks/github')
      .set('Content-Type', 'application/json')
      .set('X-GitHub-Event', 'pull_request')
      .set('X-Hub-Signature-256', sig)
      .send(raw);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_json');
  });

  it('keeps JSON parsing working for the rest of the API', async () => {
    const res = await request(buildApp()).post('/api/health').set('Content-Type', 'application/json').send('{bad');
    expect(res.body.error.code).toBe('invalid_json');
  });
});
