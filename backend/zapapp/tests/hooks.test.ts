import { Types } from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/github-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/github-client.js')>();
  return { ...actual, githubRequest: vi.fn() };
});
vi.mock('../src/modules/users/users.service.js', () => ({
  getGithubToken: vi.fn().mockResolvedValue('gho_token'),
  markGithubTokenRevoked: vi.fn(),
}));

const github = await import('../src/lib/github-client.js');
const { RepoHookModel } = await import('../src/models/repo-hook.model.js');
const { ensureHook, removeHookIfUnused } = await import('../src/modules/hooks/hooks.service.js');
const { ZapModel } = await import('../src/models/zap.model.js');

const USER = new Types.ObjectId().toString();
const REPO = 'alice/zap-test';
const URL = 'https://zap-test.ngrok-free.app/api/webhooks/github';

function mockExisting(hookId: number | null) {
  vi.spyOn(RepoHookModel, 'findOne').mockReturnValue({
    lean: vi.fn().mockResolvedValue(hookId ? { hookId, repoFullName: REPO } : null),
  } as never);
}

describe('ensureHook', () => {
  let upsert: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    upsert = vi.spyOn(RepoHookModel, 'findOneAndUpdate').mockReturnValue({
      lean: vi.fn().mockResolvedValue({ hookId: 1 }),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(github.githubRequest).mockReset();
  });

  it('creates a pull_request webhook with our URL and secret when none exists', async () => {
    mockExisting(null);
    vi.mocked(github.githubRequest).mockResolvedValue({ id: 555 });

    await ensureHook(USER, REPO);

    const [token, path, init] = vi.mocked(github.githubRequest).mock.calls[0]!;
    expect(token).toBe('gho_token');
    expect(path).toBe('/repos/alice/zap-test/hooks');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'web',
      active: true,
      events: ['pull_request'],
      config: { url: URL, content_type: 'json', secret: 'test-webhook-secret-0123456789', insecure_ssl: '0' },
    });
    expect(upsert).toHaveBeenCalledWith(
      { owner: USER, repoFullName: REPO },
      { $set: { hookId: 555, url: URL } },
      expect.objectContaining({ upsert: true }),
    );
  });

  it('reuses and refreshes an existing hook instead of creating a second one', async () => {
    mockExisting(555);
    vi.mocked(github.githubRequest).mockResolvedValue({ id: 555 });

    await ensureHook(USER, REPO);

    expect(github.githubRequest).toHaveBeenCalledTimes(1);
    const [, path, init] = vi.mocked(github.githubRequest).mock.calls[0]!;
    expect(path).toBe('/repos/alice/zap-test/hooks/555');
    expect(init?.method).toBe('PATCH');
  });

  it('recreates a hook that was deleted on GitHub', async () => {
    mockExisting(555);
    vi.mocked(github.githubRequest)
      .mockRejectedValueOnce(new github.GitHubError(404, 'Not Found'))
      .mockResolvedValueOnce({ id: 777 });

    await ensureHook(USER, REPO);

    expect(vi.mocked(github.githubRequest).mock.calls[1]![2]?.method).toBe('POST');
    expect(upsert).toHaveBeenCalledWith(expect.anything(), { $set: { hookId: 777, url: URL } }, expect.anything());
  });

  it('adopts a hook that already exists on GitHub with our URL', async () => {
    mockExisting(null);
    vi.mocked(github.githubRequest)
      .mockRejectedValueOnce(
        new github.GitHubError(422, 'Validation Failed', [{ message: 'Hook already exists on this repository' }]),
      )
      .mockResolvedValueOnce([
        { id: 1, config: { url: 'https://elsewhere.example/hook' } },
        { id: 42, config: { url: URL } },
      ])
      .mockResolvedValueOnce({ id: 42 });

    await ensureHook(USER, REPO);

    expect(vi.mocked(github.githubRequest).mock.calls[2]![1]).toBe('/repos/alice/zap-test/hooks/42');
    expect(upsert).toHaveBeenCalledWith(expect.anything(), { $set: { hookId: 42, url: URL } }, expect.anything());
  });

  it('explains a missing admin permission and saves nothing', async () => {
    mockExisting(null);
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(404, 'Not Found'));

    await expect(ensureHook(USER, REPO)).rejects.toMatchObject({ status: 422, code: 'hook_install_failed' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('asks for re-auth when GitHub rejects the token', async () => {
    mockExisting(null);
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(401, 'Bad credentials'));
    await expect(ensureHook(USER, REPO)).rejects.toMatchObject({ status: 401, code: 'github_reauth_required' });
  });
});

describe('removeHookIfUnused', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(github.githubRequest).mockReset();
  });

  it('keeps the hook while another Zap still uses the repo', async () => {
    vi.spyOn(ZapModel, 'exists').mockResolvedValue({ _id: new Types.ObjectId() } as never);
    const del = vi.spyOn(RepoHookModel, 'deleteOne');
    await removeHookIfUnused(USER, REPO);
    expect(github.githubRequest).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes the GitHub hook and our record when the repo is no longer used', async () => {
    vi.spyOn(ZapModel, 'exists').mockResolvedValue(null);
    mockExisting(555);
    const del = vi.spyOn(RepoHookModel, 'deleteOne').mockResolvedValue({} as never);
    vi.mocked(github.githubRequest).mockResolvedValue(undefined);

    await removeHookIfUnused(USER, REPO);

    expect(github.githubRequest).toHaveBeenCalledWith('gho_token', '/repos/alice/zap-test/hooks/555', { method: 'DELETE' });
    expect(del).toHaveBeenCalled();
  });

  it('treats an already-deleted GitHub hook as success and never throws', async () => {
    vi.spyOn(ZapModel, 'exists').mockResolvedValue(null);
    mockExisting(555);
    const del = vi.spyOn(RepoHookModel, 'deleteOne').mockResolvedValue({} as never);
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(404, 'Not Found'));
    await expect(removeHookIfUnused(USER, REPO)).resolves.toBeUndefined();
    expect(del).toHaveBeenCalled();

    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(500, 'boom'));
    await expect(removeHookIfUnused(USER, REPO)).resolves.toBeUndefined();
  });
});
