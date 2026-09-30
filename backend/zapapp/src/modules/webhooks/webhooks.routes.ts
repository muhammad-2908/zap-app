import express, { Router } from 'express';
import { env } from '../../config/env.js';
import { HttpError } from '../../lib/http-error.js';
import { verifyGithubSignature } from '../../lib/webhook-signature.js';
import { findZapsForPullRequestOpened, type PullRequestOpenedPayload } from './dispatcher.js';

export const webhooksRouter = Router();

/**
 * POST /api/webhooks/github
 * Mounted before express.json(): the signature is computed over the raw bytes.
 */
webhooksRouter.post('/github', express.raw({ type: 'application/json', limit: '5mb' }), async (req, res) => {
  const delivery = req.get('x-github-delivery') ?? 'unknown';
  const event = req.get('x-github-event') ?? '';
  const log = req.log.child({ delivery, event });

  const raw: unknown = req.body;
  if (!Buffer.isBuffer(raw)) {
    throw new HttpError(415, 'unsupported_media_type', 'Webhook body must be application/json');
  }
  if (!verifyGithubSignature(raw, req.get('x-hub-signature-256'), env.GITHUB_WEBHOOK_SECRET)) {
    log.warn('Webhook rejected: bad or missing signature');
    throw new HttpError(401, 'invalid_signature', 'Signature verification failed');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'invalid_json', 'Webhook body is not valid JSON');
  }

  // Sent once when the hook is created: proves the URL and secret work.
  if (event === 'ping') {
    log.info('Webhook ping received');
    res.json({ ok: true });
    return;
  }

  const pr = payload as PullRequestOpenedPayload;
  if (event !== 'pull_request' || pr.action !== 'opened') {
    log.debug({ action: pr?.action }, 'Webhook ignored: not pull_request.opened');
    res.status(204).end();
    return;
  }

  const hookId = Number(req.get('x-github-hook-id'));
  const { owner, zaps } = await findZapsForPullRequestOpened(hookId, pr);
  const context = { hookId, repo: pr.repository?.full_name, pr: pr.number };

  if (!owner) {
    log.warn(context, 'Webhook from an unknown hook id; nothing to run');
  } else {
    log.info({ ...context, matched: zaps.length, zapIds: zaps.map((z) => z._id.toString()) }, `${zaps.length} Zap(s) matched`);
  }

  // Answer fast (GitHub gives up after 10 s). M4 runs the matched Zaps after this response.
  res.status(202).json({ delivery, matched: zaps.length });
});
