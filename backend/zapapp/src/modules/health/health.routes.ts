import { Router } from 'express';
import { dbState } from '../../db/mongoose.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const db = dbState();
  const ok = db === 'connected';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    db,
    uptimeSeconds: Math.round(process.uptime()),
  });
});
