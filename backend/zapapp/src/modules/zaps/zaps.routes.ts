import { Router } from 'express';
import { currentUser, requireAuth } from '../../middleware/require-auth.js';
import { CreateZapSchema, UpdateZapSchema } from './zaps.schema.js';
import { createZap, deleteZap, getZap, listRuns, listZaps, updateZap } from './zaps.service.js';

export const zapsRouter = Router();

zapsRouter.use(requireAuth);

zapsRouter.get('/', async (req, res) => {
  res.json(await listZaps(currentUser(req).id));
});

zapsRouter.post('/', async (req, res) => {
  const input = CreateZapSchema.parse(req.body);
  res.status(201).json(await createZap(currentUser(req).id, input));
});

zapsRouter.get('/:id', async (req, res) => {
  res.json(await getZap(currentUser(req).id, req.params.id));
});

zapsRouter.patch('/:id', async (req, res) => {
  const patch = UpdateZapSchema.parse(req.body);
  res.json(await updateZap(currentUser(req).id, req.params.id, patch));
});

zapsRouter.delete('/:id', async (req, res) => {
  await deleteZap(currentUser(req).id, req.params.id);
  res.status(204).end();
});

zapsRouter.get('/:id/runs', async (req, res) => {
  res.json(await listRuns(currentUser(req).id, req.params.id));
});
