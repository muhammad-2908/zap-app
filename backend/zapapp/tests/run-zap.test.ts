import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/github-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/github-client.js')>();
  return { ...actual, githubRequest: vi.fn() };
});
vi.mock('../src/modules/users/users.service.js', () => ({
  getGithubToken: vi.fn(),
  markGithubTokenRevoked: vi.fn(),
}));

const github = await import('../src/lib/github-client.js');
const users = await import('../src/modules/users/users.service.js');
const { ZapRunModel } = await import('../src/models/zap-run.model.js');
const { ZapModel } = await import('../src/models/zap.model.js');
const { runZap, runMatchedZaps } = await import('../src/modules/engine/run-zap.js');
const { retryPolicy } = await import('../src/modules/engine/actions/github-pull-request-comment.js');

const OWNER = new Types.ObjectId();

const zap = (body = 'Thanks @{{pr.author}} for #{{pr.number}} on {{repo.name}}!') =>
  ({
    _id: new Types.ObjectId(),
    owner: OWNER,
    name: 'Thank PR authors',
    enabled: true,
    trigger: { app: 'github', event: 'pull_request.opened', key: 'github:pull_request.opened', config: { repoFullName: 'alice/zap-test' } },
    action: { app: 'github', type: 'pull_request.comment', fields: { body } },
    source: 'manual',
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as const;

const payload = {
  action: 'opened',
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
};

describe('runZap', () => {
  let createRun: ReturnType<typeof vi.spyOn>;
  let updateRun: ReturnType<typeof vi.spyOn>;
  let updateZap: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    retryPolicy.delayMs = 0;
    createRun = vi.spyOn(ZapRunModel, 'create').mockResolvedValue({ _id: new Types.ObjectId() } as never);
    updateRun = vi.spyOn(ZapRunModel, 'updateOne').mockResolvedValue({} as never);
    updateZap = vi.spyOn(ZapModel, 'updateOne').mockResolvedValue({} as never);
    vi.mocked(users.getGithubToken).mockResolvedValue('gho_owner_token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(github.githubRequest).mockReset();
    vi.mocked(users.markGithubTokenRevoked).mockReset();
  });

  it('renders the template and comments on the same PR with the owner\'s token', async () => {
    vi.mocked(github.githubRequest).mockResolvedValue({ html_url: 'https://github.com/alice/zap-test/pull/7#issuecomment-1' });
    const z = zap();

    expect(await runZap(z as never, 'd-1', payload)).toBe('success');

    expect(github.githubRequest).toHaveBeenCalledWith('gho_owner_token', '/repos/alice/zap-test/issues/7/comments', {
      method: 'POST',
      body: JSON.stringify({ body: 'Thanks @bob for #7 on zap-test!' }),
    });
    expect(createRun).toHaveBeenCalledWith(
      expect.objectContaining({ zap: z._id, deliveryId: 'd-1', status: 'running', prNumber: 7 }),
    );
    expect(updateRun).toHaveBeenCalledWith(
      expect.anything(),
      { $set: expect.objectContaining({ status: 'success', commentUrl: expect.stringContaining('issuecomment') }) },
    );
    expect(updateZap).toHaveBeenCalledWith(
      { _id: z._id },
      { $set: expect.objectContaining({ lastRunStatus: 'success', lastRunError: null }) },
    );
  });

  it('skips a delivery this Zap already handled (no second comment)', async () => {
    createRun.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));
    expect(await runZap(zap() as never, 'd-1', payload)).toBe('duplicate');
    expect(github.githubRequest).not.toHaveBeenCalled();
    expect(updateZap).not.toHaveBeenCalled();
  });

  it('retries once on a GitHub 5xx', async () => {
    vi.mocked(github.githubRequest)
      .mockRejectedValueOnce(new github.GitHubError(502, 'Bad Gateway'))
      .mockResolvedValueOnce({ html_url: 'https://github.com/x#c' });
    expect(await runZap(zap() as never, 'd-1', payload)).toBe('success');
    expect(github.githubRequest).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 4xx and records the reason on the run and the Zap', async () => {
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(403, 'Resource not accessible'));
    expect(await runZap(zap() as never, 'd-1', payload)).toBe('failed');
    expect(github.githubRequest).toHaveBeenCalledTimes(1);
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), {
      $set: expect.objectContaining({ status: 'failed', error: expect.objectContaining({ code: 'github_forbidden', status: 403 }) }),
    });
    expect(updateZap).toHaveBeenCalledWith(expect.anything(), {
      $set: expect.objectContaining({ lastRunStatus: 'failed', lastRunError: expect.stringContaining('Resource not accessible') }),
    });
  });

  it('marks the owner\'s token revoked when GitHub returns 401', async () => {
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(401, 'Bad credentials'));
    expect(await runZap(zap() as never, 'd-1', payload)).toBe('failed');
    expect(users.markGithubTokenRevoked).toHaveBeenCalledWith(OWNER.toString());
  });

  it('fails without calling GitHub when the rendered comment is empty', async () => {
    expect(await runZap(zap('{{pr.missing}}  ') as never, 'd-1', payload)).toBe('failed');
    expect(github.githubRequest).not.toHaveBeenCalled();
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), {
      $set: expect.objectContaining({ error: expect.objectContaining({ code: 'empty_comment' }) }),
    });
  });

  it('runs every matched Zap even if one fails', async () => {
    vi.mocked(github.githubRequest)
      .mockRejectedValueOnce(new github.GitHubError(404, 'Not Found'))
      .mockResolvedValueOnce({ html_url: 'https://github.com/x#c' });
    const outcomes = await runMatchedZaps([zap() as never, zap() as never], 'd-2', payload);
    expect(outcomes.sort()).toEqual(['failed', 'success']);
  });
});
