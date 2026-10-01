import { Router } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth } from '../../middleware/require-auth.js';
import { draftZap } from './copilot.service.js';

export const copilotRouter = Router();

const DraftRequest = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(5, 'Describe the automation in a few words')
      .max(500, 'Keep the description under 500 characters'),
  })
  .strict();

/** POST /api/copilot/draft — returns a draft Zap for review. Nothing is saved. */
copilotRouter.post('/draft', requireAuth, async (req, res) => {
  const { prompt } = DraftRequest.parse(req.body);
  res.json(await draftZap(currentUser(req).id, prompt));
});
