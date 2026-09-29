import type { Request, RequestHandler } from 'express';
import { HttpError } from '../lib/http-error.js';
import { SESSION_COOKIE, verifySession } from '../lib/session.js';
import { findUserById, type PublicUser } from '../modules/users/users.service.js';

/** Rejects the request with 401 unless it carries a valid session for an existing user. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const userId = typeof token === 'string' ? await verifySession(token) : null;
  const user = userId ? await findUserById(userId) : null;
  if (!user) {
    throw new HttpError(401, 'unauthenticated', 'Sign in to continue');
  }
  req.user = user;
  next();
};

/** For handlers behind requireAuth: returns the user or fails loudly if the middleware was skipped. */
export function currentUser(req: Request): PublicUser {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Sign in to continue');
  return req.user;
}
