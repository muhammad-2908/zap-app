import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import { env } from '../../config/env.js';
import { buildAuthorizeUrl } from '../../lib/github-client.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../../lib/session.js';
import { currentUser, requireAuth } from '../../middleware/require-auth.js';
import { completeGithubLogin } from './auth.service.js';

export const authRouter = Router();

const STATE_COOKIE = 'zap_oauth_state';
const STATE_COOKIE_PATH = '/api/auth/github';

type LoginError = 'denied' | 'state' | 'github';

function redirectToLogin(res: Response, error: LoginError): void {
  res.redirect(302, `${env.FRONTEND_URL}/login?error=${error}`);
}

function sameState(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Step 1: send the browser to GitHub with a one-time state value we can check on return (CSRF). */
authRouter.get('/github', (_req, res) => {
  const state = randomBytes(24).toString('base64url');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: STATE_COOKIE_PATH,
    maxAge: 10 * 60 * 1000,
  });
  res.redirect(302, buildAuthorizeUrl(state));
});

/** Step 2: GitHub sends the browser back here with ?code&state (or ?error). */
authRouter.get('/github/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const expectedState: unknown = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: STATE_COOKIE_PATH });

  if (error === 'access_denied') {
    redirectToLogin(res, 'denied');
    return;
  }
  if (
    typeof code !== 'string' ||
    typeof state !== 'string' ||
    typeof expectedState !== 'string' ||
    !sameState(state, expectedState)
  ) {
    req.log.warn('OAuth callback with missing or mismatched state');
    redirectToLogin(res, 'state');
    return;
  }

  try {
    const { user, sessionToken } = await completeGithubLogin(code);
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    req.log.info({ userId: user.id, login: user.login }, 'User signed in');
    res.redirect(302, `${env.FRONTEND_URL}/zaps`);
  } catch (err) {
    req.log.error({ err }, 'GitHub sign-in failed');
    redirectToLogin(res, 'github');
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(currentUser(req));
});

/** Idempotent: clearing an absent cookie is fine, so no auth required. */
authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, clearOptions);
  res.status(204).end();
});
