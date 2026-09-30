import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/require-auth.js';
import { listAdminRepos } from './github.service.js';

export const githubRouter = Router();

githubRouter.use(requireAuth);

/** GET /api/github/repos[?fresh=1] */
githubRouter.get('/repos', async (req, res) => {
  res.json(await listAdminRepos(currentUser(req).id, { fresh: req.query.fresh === '1' }));
});
