import { Router } from 'express';
import { CATALOG } from '../../catalog/catalog.js';
import { requireAuth } from '../../middleware/require-auth.js';

export const catalogRouter = Router();

catalogRouter.get('/', requireAuth, (_req, res) => {
  res.set('Cache-Control', 'private, max-age=300').json(CATALOG);
});
