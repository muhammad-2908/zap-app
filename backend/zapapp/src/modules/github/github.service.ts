import { HttpError } from '../../lib/http-error.js';
import { GitHubError, githubRequest } from '../../lib/github-client.js';
import { getGithubToken, markGithubTokenRevoked } from '../users/users.service.js';

export interface RepoSummary {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
}

interface GitHubRepo {
  full_name: string;
  name: string;
  owner: { login: string };
  private: boolean;
  html_url: string;
  updated_at: string;
  permissions?: { admin?: boolean };
}

// Small per-user cache: the builder asks for repos on every open; GitHub rate limits are per token.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; repos: RepoSummary[] }>();

export function clearRepoCache(): void {
  cache.clear();
}

/** Runs a GitHub call with the user's token and maps auth failures to a "reconnect" error. */
export async function withUserToken<T>(userId: string, call: (token: string) => Promise<T>): Promise<T> {
  const token = await getGithubToken(userId);
  if (!token) throw reauthError();
  try {
    return await call(token);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 401) {
      await markGithubTokenRevoked(userId);
      throw reauthError();
    }
    if (err instanceof GitHubError) {
      throw new HttpError(502, 'github_error', `GitHub error: ${err.message}`);
    }
    throw err;
  }
}

function reauthError(): HttpError {
  return new HttpError(401, 'github_reauth_required', 'GitHub access has expired. Please sign in with GitHub again.');
}

/**
 * Repositories the user can install a webhook on (admin permission), most recently updated first.
 * Up to 100 repos is plenty for this app; pagination is a known limit.
 */
export async function listAdminRepos(userId: string, { fresh = false } = {}): Promise<RepoSummary[]> {
  const hit = cache.get(userId);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.repos;

  const repos = await withUserToken(userId, (token) =>
    githubRequest<GitHubRepo[]>(
      token,
      '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
    ),
  );

  const result = repos
    .filter((r) => r.permissions?.admin)
    .map((r) => ({
      fullName: r.full_name,
      name: r.name,
      owner: r.owner.login,
      private: r.private,
      htmlUrl: r.html_url,
      updatedAt: r.updated_at,
    }));
  cache.set(userId, { at: Date.now(), repos: result });
  return result;
}
