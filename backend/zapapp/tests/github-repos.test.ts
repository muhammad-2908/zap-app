import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const { listAdminRepos, clearRepoCache } = await import('../src/modules/github/github.service.js');

const repo = (name: string, admin: boolean) => ({
  full_name: `alice/${name}`,
  name,
  owner: { login: 'alice' },
  private: false,
  html_url: `https://github.com/alice/${name}`,
  updated_at: '2026-09-30T00:00:00Z',
  permissions: { admin },
});

describe('listAdminRepos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRepoCache();
    vi.mocked(users.getGithubToken).mockResolvedValue('gho_token');
  });

  it('keeps only repos the user can administer', async () => {
    vi.mocked(github.githubRequest).mockResolvedValue([repo('zap-test', true), repo('upstream', false)]);
    const repos = await listAdminRepos('u1');
    expect(repos.map((r) => r.fullName)).toEqual(['alice/zap-test']);
    expect(github.githubRequest).toHaveBeenCalledWith('gho_token', expect.stringContaining('/user/repos?'));
  });

  it('caches per user for a minute unless fresh is requested', async () => {
    vi.mocked(github.githubRequest).mockResolvedValue([repo('zap-test', true)]);
    await listAdminRepos('u1');
    await listAdminRepos('u1');
    expect(github.githubRequest).toHaveBeenCalledTimes(1);
    await listAdminRepos('u1', { fresh: true });
    expect(github.githubRequest).toHaveBeenCalledTimes(2);
  });

  it('marks the token revoked and asks for re-auth on GitHub 401', async () => {
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(401, 'Bad credentials'));
    await expect(listAdminRepos('u1')).rejects.toMatchObject({ status: 401, code: 'github_reauth_required' });
    expect(users.markGithubTokenRevoked).toHaveBeenCalledWith('u1');
  });

  it('maps other GitHub failures to 502', async () => {
    vi.mocked(github.githubRequest).mockRejectedValue(new github.GitHubError(500, 'boom'));
    await expect(listAdminRepos('u1')).rejects.toMatchObject({ status: 502, code: 'github_error' });
  });
});
