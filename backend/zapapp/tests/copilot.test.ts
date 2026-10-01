import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/users/users.service.js', () => ({ findUserById: vi.fn() }));
vi.mock('../src/modules/github/github.service.js', () => ({ listAdminRepos: vi.fn() }));
vi.mock('../src/modules/copilot/llm.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/copilot/llm.js')>();
  return { ...actual, isLlmConfigured: vi.fn().mockReturnValue(false), draftWithLlm: vi.fn() };
});

const { buildApp } = await import('../src/app.js');
const { signSession } = await import('../src/lib/session.js');
const users = await import('../src/modules/users/users.service.js');
const github = await import('../src/modules/github/github.service.js');
const llm = await import('../src/modules/copilot/llm.js');
const { resetRateLimit } = await import('../src/modules/copilot/copilot.service.js');
const { HttpError } = await import('../src/lib/http-error.js');

const USER = { id: new Types.ObjectId().toString(), githubId: 1, login: 'alice', name: null, avatarUrl: null, tokenStatus: 'valid' as const };
const repo = (fullName: string) => ({ fullName, name: fullName.split('/')[1]!, owner: 'alice', private: false, htmlUrl: '', updatedAt: '' });

const llmDraft = (overrides: Record<string, unknown> = {}) => ({
  feasible: true,
  reason: '',
  name: 'Thank PR authors',
  triggerApp: 'GitHub',
  triggerEvent: 'pull_request.opened',
  repoFullName: 'alice/zap-test',
  actionApp: 'github',
  actionType: 'pull_request.comment',
  actionFields: { body: 'Thanks @{{pr.author}}!' },
  ...overrides,
});

describe('POST /api/copilot/draft', () => {
  const app = buildApp();
  let cookie: string;

  beforeEach(async () => {
    resetRateLimit();
    vi.mocked(users.findUserById).mockResolvedValue(USER);
    vi.mocked(github.listAdminRepos).mockResolvedValue([repo('alice/zap-test')]);
    cookie = `zap_session=${await signSession(USER.id)}`;
  });

  afterEach(() => {
    vi.mocked(llm.isLlmConfigured).mockReturnValue(false);
    vi.mocked(llm.draftWithLlm).mockReset();
  });

  const post = (prompt: unknown) => request(app).post('/api/copilot/draft').set('Cookie', cookie).send({ prompt });

  it('requires a session', async () => {
    expect((await request(app).post('/api/copilot/draft').send({ prompt: 'hello there' })).status).toBe(401);
  });

  it('validates the prompt', async () => {
    const res = await post('hi');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
  });

  it('drafts the brief\'s example without an API key, never enabled', async () => {
    const res = await post('When a pull request is opened, comment thanks.');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('rules');
    expect(res.body.draft).toEqual({
      name: 'Thank pull request authors',
      enabled: false,
      trigger: { app: 'github', event: 'pull_request.opened', config: { repoFullName: '' } },
      action: { app: 'github', type: 'pull_request.comment', fields: { body: 'Thanks @{{pr.author}} for opening #{{pr.number}}!' } },
    });
    expect(res.body.warnings).toEqual(['Pick the repository this Zap should watch.']);
  });

  it('uses the LLM when configured, normalizing case and keeping only the user\'s repos', async () => {
    vi.mocked(llm.isLlmConfigured).mockReturnValue(true);
    vi.mocked(llm.draftWithLlm).mockResolvedValue(llmDraft({ repoFullName: 'ALICE/zap-test' }));
    const res = await post('When a PR is opened on zap-test, say thanks');
    expect(res.body.mode).toBe('llm');
    expect(res.body.draft.trigger).toEqual({ app: 'github', event: 'pull_request.opened', config: { repoFullName: 'alice/zap-test' } });
    expect(res.body.warnings).toEqual([]);
    expect(llm.draftWithLlm).toHaveBeenCalledWith('When a PR is opened on zap-test, say thanks', ['alice/zap-test']);
  });

  it('drops a repository the user does not administer', async () => {
    vi.mocked(llm.isLlmConfigured).mockReturnValue(true);
    vi.mocked(llm.draftWithLlm).mockResolvedValue(llmDraft({ repoFullName: 'someone/else' }));
    const res = await post('When a PR is opened on someone/else, say thanks');
    expect(res.body.draft.trigger.config.repoFullName).toBe('');
    expect(res.body.warnings).toContain('Pick the repository this Zap should watch.');
  });

  it('surfaces catalog problems in the draft as warnings', async () => {
    vi.mocked(llm.isLlmConfigured).mockReturnValue(true);
    vi.mocked(llm.draftWithLlm).mockResolvedValue(llmDraft({ actionFields: { body: 'Hi {{issue.title}}' } }));
    const res = await post('When a PR is opened, comment hi');
    expect(res.body.warnings).toContain('Unknown data: {{issue.title}}');
  });

  it('explains unsupported requests with 422', async () => {
    vi.mocked(llm.isLlmConfigured).mockReturnValue(true);
    vi.mocked(llm.draftWithLlm).mockResolvedValue(llmDraft({ feasible: false, reason: 'Slack is not available yet.' }));
    const res = await post('When a PR is opened, post to Slack');
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ code: 'copilot_unsupported', message: 'Slack is not available yet.' });
  });

  it('falls back to the rule parser when the LLM fails', async () => {
    vi.mocked(llm.isLlmConfigured).mockReturnValue(true);
    vi.mocked(llm.draftWithLlm).mockRejectedValue(new Error('overloaded'));
    const res = await post('When a pull request is opened, comment thanks');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('rules');
    expect(res.body.warnings[0]).toContain('AI Copilot was unavailable');
  });

  it('asks for re-auth when GitHub rejects the token', async () => {
    vi.mocked(github.listAdminRepos).mockRejectedValue(new HttpError(401, 'github_reauth_required', 'Sign in again'));
    const res = await post('When a pull request is opened, comment thanks');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('github_reauth_required');
  });

  it('rate-limits to 10 drafts a minute per user', async () => {
    for (let i = 0; i < 10; i++) expect((await post('When a PR is opened, comment thanks')).status).toBe(200);
    const res = await post('When a PR is opened, comment thanks');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('copilot_rate_limited');
  });
});
