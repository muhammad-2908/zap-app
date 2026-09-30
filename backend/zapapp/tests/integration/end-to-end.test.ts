import { createHmac } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The whole backend against a real MongoDB; only GitHub's HTTP API is faked.
 * Covers what unit tests can't: unique indexes (idempotency), owner scoping in real queries,
 * and the webhook -> run -> comment path through the database.
 */
vi.mock('../../src/lib/github-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/github-client.js')>();
  return { ...actual, githubRequest: vi.fn() };
});

const github = await import('../../src/lib/github-client.js');
const { buildApp } = await import('../../src/app.js');
const { signSession } = await import('../../src/lib/session.js');
const { encryptSecret } = await import('../../src/lib/crypto.js');
const { UserModel } = await import('../../src/models/user.model.js');
const { ZapModel } = await import('../../src/models/zap.model.js');
const { ZapRunModel } = await import('../../src/models/zap-run.model.js');
const { RepoHookModel } = await import('../../src/models/repo-hook.model.js');

const SECRET = 'test-webhook-secret-0123456789';
const REPO = 'alice/zap-test';
const HOOK_ID = 101;

let mongo: MongoMemoryServer;
const app = buildApp();

/** Fake GitHub: hook create/update/delete and comment create. Records every call. */
function fakeGithub() {
  let comments = 0;
  vi.mocked(github.githubRequest).mockImplementation(async (_token, path, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && path === `/repos/${REPO}/hooks`) return { id: HOOK_ID };
    if (method === 'PATCH' && path === `/repos/${REPO}/hooks/${HOOK_ID}`) return { id: HOOK_ID };
    if (method === 'DELETE') return undefined;
    if (method === 'POST' && path.endsWith('/comments')) {
      comments += 1;
      return { html_url: `https://github.com/${REPO}/pull/7#issuecomment-${comments}` };
    }
    throw new Error(`Unexpected GitHub call ${method} ${path}`);
  });
}

async function createUser(login: string, githubId: number) {
  const user = await UserModel.create({ githubId, login, accessTokenEnc: encryptSecret(`gho_${login}`) });
  return { id: user._id.toString(), cookie: `zap_session=${await signSession(user._id.toString())}` };
}

const zapBody = (enabled: boolean) => ({
  name: 'Thank PR authors',
  enabled,
  trigger: { app: 'github', event: 'pull_request.opened', config: { repoFullName: REPO } },
  action: { app: 'github', type: 'pull_request.comment', fields: { body: 'Thanks @{{pr.author}} for #{{pr.number}}!' } },
});

function deliverPrOpened(deliveryId: string) {
  const raw = JSON.stringify({
    action: 'opened',
    number: 7,
    pull_request: {
      number: 7,
      title: 'Add feature',
      html_url: `https://github.com/${REPO}/pull/7`,
      user: { login: 'bob' },
      head: { ref: 'feature' },
      base: { ref: 'main' },
    },
    repository: { full_name: REPO, name: 'zap-test' },
  });
  return request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Event', 'pull_request')
    .set('X-GitHub-Delivery', deliveryId)
    .set('X-GitHub-Hook-ID', String(HOOK_ID))
    .set('X-Hub-Signature-256', `sha256=${createHmac('sha256', SECRET).update(raw).digest('hex')}`)
    .send(raw);
}

/** Runs happen after the 202: wait until `expected` runs exist for the delivery and none is running. */
async function settled(deliveryId: string, expected: number) {
  for (let i = 0; i < 100; i++) {
    const [total, running] = await Promise.all([
      ZapRunModel.countDocuments({ deliveryId }),
      ZapRunModel.countDocuments({ deliveryId, status: 'running' }),
    ]);
    if (total >= expected && running === 0) {
      await new Promise((r) => setTimeout(r, 50)); // let the Zap's lastRun update land
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`runs for ${deliveryId} did not finish`);
}

const commentCalls = () =>
  vi.mocked(github.githubRequest).mock.calls.filter(([, path, init]) => init?.method === 'POST' && path.endsWith('/comments'));

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('zap-app-test'));
  // Build indexes now: idempotency relies on the unique (zap, deliveryId) index.
  await Promise.all([UserModel.init(), ZapModel.init(), ZapRunModel.init(), RepoHookModel.init()]);
});

afterEach(async () => {
  vi.mocked(github.githubRequest).mockReset();
  await Promise.all([UserModel.deleteMany({}), ZapModel.deleteMany({}), ZapRunModel.deleteMany({}), RepoHookModel.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

describe('ownership', () => {
  it('keeps each user\'s Zaps private', async () => {
    fakeGithub();
    const alice = await createUser('alice', 1);
    const bob = await createUser('bob', 2);

    const created = await request(app).post('/api/zaps').set('Cookie', alice.cookie).send(zapBody(false));
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    expect((await request(app).get('/api/zaps').set('Cookie', alice.cookie)).body).toHaveLength(1);
    expect((await request(app).get('/api/zaps').set('Cookie', bob.cookie)).body).toHaveLength(0);

    for (const req of [
      request(app).get(`/api/zaps/${id}`),
      request(app).patch(`/api/zaps/${id}`).send({ enabled: true }),
      request(app).get(`/api/zaps/${id}/runs`),
      request(app).delete(`/api/zaps/${id}`),
    ]) {
      const res = await req.set('Cookie', bob.cookie);
      expect(res.status).toBe(404);
    }
    expect(await ZapModel.countDocuments({ _id: id, enabled: false })).toBe(1);
  });
});

describe('PR opened -> comment, end to end', () => {
  it('installs one webhook, comments once per delivery, skips disabled Zaps', async () => {
    fakeGithub();
    const alice = await createUser('alice', 1);

    // Turn on two Zaps on the same repo: one hook, created then reused.
    const a = await request(app).post('/api/zaps').set('Cookie', alice.cookie).send(zapBody(true));
    const b = await request(app).post('/api/zaps').set('Cookie', alice.cookie).send(zapBody(true));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await RepoHookModel.countDocuments({ repoFullName: REPO, hookId: HOOK_ID })).toBe(1);

    // A PR is opened: both Zaps comment once, with the rendered text, as Alice.
    const first = await deliverPrOpened('delivery-1');
    expect(first.status).toBe(202);
    expect(first.body.matched).toBe(2);
    await settled('delivery-1', 2);
    expect(commentCalls()).toHaveLength(2);
    const [token, path, init] = commentCalls()[0]!;
    expect(token).toBe('gho_alice');
    expect(path).toBe(`/repos/${REPO}/issues/7/comments`);
    expect(JSON.parse(String(init?.body))).toEqual({ body: 'Thanks @bob for #7!' });

    const listed = await request(app).get('/api/zaps').set('Cookie', alice.cookie);
    expect(listed.body.every((z: { lastRunStatus: string }) => z.lastRunStatus === 'success')).toBe(true);

    // GitHub redelivers the same event: the unique index stops a second comment.
    await deliverPrOpened('delivery-1');
    await new Promise((r) => setTimeout(r, 300)); // give a (wrong) second run time to happen
    expect(commentCalls()).toHaveLength(2);
    expect(await ZapRunModel.countDocuments({ deliveryId: 'delivery-1' })).toBe(2);

    // Turn one Zap off: the next PR only runs the other.
    await request(app).patch(`/api/zaps/${b.body.id}`).set('Cookie', alice.cookie).send({ enabled: false });
    const second = await deliverPrOpened('delivery-2');
    expect(second.body.matched).toBe(1);
    await settled('delivery-2', 1);
    expect(commentCalls()).toHaveLength(3);

    const runs = await request(app).get(`/api/zaps/${a.body.id}/runs`).set('Cookie', alice.cookie);
    expect(runs.body.map((r: { status: string }) => r.status)).toEqual(['success', 'success']);
    expect(runs.body[0].commentUrl).toContain('issuecomment');
  });

  it('removes the webhook when the last Zap on the repo is deleted', async () => {
    fakeGithub();
    const alice = await createUser('alice', 1);
    const a = await request(app).post('/api/zaps').set('Cookie', alice.cookie).send(zapBody(true));
    const b = await request(app).post('/api/zaps').set('Cookie', alice.cookie).send(zapBody(false));

    await request(app).delete(`/api/zaps/${a.body.id}`).set('Cookie', alice.cookie).expect(204);
    expect(await RepoHookModel.countDocuments()).toBe(1); // b still uses the repo

    await request(app).delete(`/api/zaps/${b.body.id}`).set('Cookie', alice.cookie).expect(204);
    expect(await RepoHookModel.countDocuments()).toBe(0);
    const deletes = vi.mocked(github.githubRequest).mock.calls.filter(([, , init]) => init?.method === 'DELETE');
    expect(deletes.map(([, path]) => path)).toEqual([`/repos/${REPO}/hooks/${HOOK_ID}`]);
  });

  it('does not save an enabled Zap when GitHub refuses the webhook', async () => {
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(404, 'Not Found'));
    const alice = await createUser('alice', 1);
    const res = await request(app).post('/api/zaps').set('Cookie', alice.cookie).send(zapBody(true));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('hook_install_failed');
    expect(await ZapModel.countDocuments()).toBe(0);
  });
});
