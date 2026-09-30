import { env } from '../config/env.js';

/**
 * Scopes requested at sign-in. repo + admin:repo_hook are needed from M3 on (install the
 * webhook, post comments); asking now means users consent once instead of twice.
 */
export const GITHUB_OAUTH_SCOPES = ['read:user', 'repo', 'admin:repo_hook'];

const API_BASE = 'https://api.github.com';
const USER_AGENT = 'zap-app';

export class GitHubError extends Error {
  readonly status: number;
  /** GitHub's `errors` array on 422 responses, e.g. [{ message: 'Hook already exists on this repository' }]. */
  readonly errors: { message?: string; code?: string }[];

  constructor(status: number, message: string, errors: { message?: string; code?: string }[] = []) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.errors = errors;
  }
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', env.GITHUB_OAUTH_CALLBACK_URL);
  url.searchParams.set('scope', GITHUB_OAUTH_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'true');
  return url.toString();
}

/** Exchanges the one-time OAuth code for an access token. */
export async function exchangeCodeForToken(code: string): Promise<{ accessToken: string; scopes: string[] }> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_OAUTH_CALLBACK_URL,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  // GitHub answers 200 even for a bad code; the error is in the body.
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new GitHubError(res.ok ? 400 : res.status, body.error_description ?? body.error ?? 'Token exchange failed');
  }
  return { accessToken: body.access_token, scopes: body.scope ? body.scope.split(/[ ,]+/).filter(Boolean) : [] };
}

/** Authenticated call to the GitHub REST API. Throws GitHubError on non-2xx. */
export async function githubRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; errors?: { message?: string }[] };
    throw new GitHubError(res.status, body.message ?? `GitHub API ${res.status}`, body.errors ?? []);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function getAuthenticatedUser(token: string): Promise<GitHubUser> {
  return githubRequest<GitHubUser>(token, '/user');
}
