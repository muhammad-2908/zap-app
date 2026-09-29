import type { PublicUser } from '../modules/users/users.service.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth for signed-in requests. */
      user?: PublicUser;
    }
  }
}

export {};
