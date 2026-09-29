import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// GitHub and the database are mocked: these tests cover our OAuth handling, cookies and guards.
vi.mock('../src/lib/github-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/github-client.js')>();
  return { ...actual, exchangeCodeForToken: vi.fn(), getAuthenticatedUser: vi.fn() };
});
vi.mock('../src/modules/users/users.service.js', () => ({
  upsertGithubUser: vi.fn(),
  findUserById: vi.fn(),
}));

const { buildApp } = await import('../src/app.js');
const github = await import('../src/lib/github-client.js');
const users = await import('../src/modules/users/users.service.js');
const { signSession } = await import('../src/lib/session.js');

const USER = {
  id: '652f1c2b9d3e4a0012345678',
  githubId: 42,
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/42',
  tokenStatus: 'valid' as const,
};

function cookieValue(setCookie: string[] | undefined, name: string): string | undefined {
  const raw = setCookie?.find((c) => c.startsWith(`${name}=`));
  return raw?.split(';')[0]?.slice(name.length + 1);
}

describe('GitHub sign-in', () => {
  const app = buildApp();

  beforeEach(() => vi.clearAllMocks());

  it('redirects to GitHub with scopes and a state that matches an httpOnly cookie', async () => {
    const res = await request(app).get('/api/auth/github');
    expect(res.status).toBe(302);

    const location = new URL(res.headers.location!);
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe('test-client-id');
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:4200/api/auth/github/callback');
    expect(location.searchParams.get('scope')).toBe('read:user repo admin:repo_hook');

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const state = cookieValue(setCookie, 'zap_oauth_state');
    expect(state).toBeTruthy();
    expect(location.searchParams.get('state')).toBe(state);
    expect(setCookie.find((c) => c.startsWith('zap_oauth_state='))).toMatch(/HttpOnly/);
  });

  it('sends a cancelled consent back to /login?error=denied', async () => {
    const res = await request(app).get('/api/auth/github/callback?error=access_denied&state=x');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:4200/login?error=denied');
  });

  it('rejects a state that does not match the cookie', async () => {
    const res = await request(app)
      .get('/api/auth/github/callback?code=abc&state=forged')
      .set('Cookie', 'zap_oauth_state=real');
    expect(res.headers.location).toBe('http://localhost:4200/login?error=state');
    expect(github.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it('rejects a callback with no state cookie', async () => {
    const res = await request(app).get('/api/auth/github/callback?code=abc&state=abc');
    expect(res.headers.location).toBe('http://localhost:4200/login?error=state');
  });

  it('signs the user in and redirects to /zaps on success', async () => {
    vi.mocked(github.exchangeCodeForToken).mockResolvedValue({ accessToken: 'gho_secret', scopes: ['repo'] });
    vi.mocked(github.getAuthenticatedUser).mockResolvedValue({
      id: 42,
      login: 'octocat',
      name: 'The Octocat',
      avatar_url: null,
      email: null,
    });
    vi.mocked(users.upsertGithubUser).mockResolvedValue(USER);

    const res = await request(app)
      .get('/api/auth/github/callback?code=good&state=s1')
      .set('Cookie', 'zap_oauth_state=s1');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:4200/zaps');
    expect(github.exchangeCodeForToken).toHaveBeenCalledWith('good');
    expect(users.upsertGithubUser).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }), 'gho_secret', ['repo']);

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const session = setCookie.find((c) => c.startsWith('zap_session='));
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(session).not.toContain('gho_secret');
  });

  it('sends GitHub failures back to /login?error=github', async () => {
    vi.mocked(github.exchangeCodeForToken).mockRejectedValue(new github.GitHubError(400, 'bad_verification_code'));
    const res = await request(app)
      .get('/api/auth/github/callback?code=expired&state=s1')
      .set('Cookie', 'zap_oauth_state=s1');
    expect(res.headers.location).toBe('http://localhost:4200/login?error=github');
  });
});

describe('session', () => {
  const app = buildApp();

  beforeEach(() => vi.clearAllMocks());

  it('returns 401 from /me without a session', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('returns 401 for a tampered session', async () => {
    const token = await signSession(USER.id);
    const res = await request(app).get('/api/auth/me').set('Cookie', `zap_session=${token}x`);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the session user no longer exists', async () => {
    vi.mocked(users.findUserById).mockResolvedValue(null);
    const token = await signSession(USER.id);
    const res = await request(app).get('/api/auth/me').set('Cookie', `zap_session=${token}`);
    expect(res.status).toBe(401);
  });

  it('returns the public user for a valid session', async () => {
    vi.mocked(users.findUserById).mockResolvedValue(USER);
    const token = await signSession(USER.id);
    const res = await request(app).get('/api/auth/me').set('Cookie', `zap_session=${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(USER);
    expect(JSON.stringify(res.body)).not.toMatch(/token(Enc)?"\s*:\s*"gho_/);
  });

  it('clears the session cookie on logout', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie.find((c) => c.startsWith('zap_session=;'))).toMatch(/Expires=Thu, 01 Jan 1970/);
  });
});
