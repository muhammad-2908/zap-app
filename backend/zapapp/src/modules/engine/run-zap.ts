import { GitHubError } from '../../lib/github-client.js';
import { logger } from '../../lib/logger.js';
import { ZapRunModel } from '../../models/zap-run.model.js';
import { ZapModel, type ZapDoc } from '../../models/zap.model.js';
import { getGithubToken, markGithubTokenRevoked } from '../users/users.service.js';
import { ACTIONS, TRIGGERS } from './registry.js';
import { RunError } from './types.js';

export type RunOutcome = 'success' | 'failed' | 'duplicate';

const isDuplicateKey = (err: unknown) => (err as { code?: number })?.code === 11000;

function toRunError(err: unknown): RunError {
  if (err instanceof RunError) return err;
  if (err instanceof GitHubError) {
    if (err.status === 401) {
      return new RunError('github_reauth_required', 'GitHub rejected the token. Sign in again to reconnect.', 401);
    }
    if (err.status === 403 || err.status === 404) {
      return new RunError('github_forbidden', `GitHub refused the comment: ${err.message}`, err.status);
    }
    return new RunError('github_error', `GitHub error: ${err.message}`, err.status);
  }
  return new RunError('internal_error', err instanceof Error ? err.message : 'Unexpected error');
}

/**
 * Runs one Zap for one delivery and records the outcome. Never throws: every failure ends up on
 * the run record and on the Zap's lastRun fields, so one bad Zap can't stop the others.
 */
export async function runZap(zap: ZapDoc, deliveryId: string, payload: unknown): Promise<RunOutcome> {
  const started = Date.now();
  const log = logger.child({ zapId: zap._id.toString(), deliveryId });

  const trigger = TRIGGERS[zap.trigger.key];
  const action = ACTIONS[`${zap.action.app}:${zap.action.type}`];
  if (!trigger || !action) {
    log.error({ trigger: zap.trigger.key, action: zap.action.type }, 'Zap is not runnable');
    return 'failed';
  }
  const target = trigger.target(payload);

  // Claim this (zap, delivery) pair first. A redelivery hits the unique index and stops here.
  let runId;
  try {
    const run = await ZapRunModel.create({
      zap: zap._id,
      owner: zap.owner,
      deliveryId,
      status: 'running',
      repoFullName: target.repoFullName,
      prNumber: target.prNumber,
    });
    runId = run._id;
  } catch (err) {
    if (isDuplicateKey(err)) {
      log.info('Delivery already handled for this Zap; skipping');
      return 'duplicate';
    }
    throw err;
  }

  let outcome: RunOutcome;
  let update: Record<string, unknown>;
  try {
    const token = await getGithubToken(zap.owner.toString());
    if (!token) throw new RunError('github_reauth_required', 'No GitHub token stored. Sign in again.');
    const result = await action.execute({ zap, context: trigger.buildContext(payload), target, token });
    outcome = 'success';
    update = { status: 'success', renderedBody: result.renderedBody, commentUrl: result.commentUrl };
    log.info({ commentUrl: result.commentUrl }, 'Zap ran: comment posted');
  } catch (err) {
    const runError = toRunError(err);
    if (runError.code === 'github_reauth_required') await markGithubTokenRevoked(zap.owner.toString());
    outcome = 'failed';
    update = { status: 'failed', error: { code: runError.code, message: runError.message, status: runError.status } };
    log.warn({ err: runError }, 'Zap run failed');
  }

  const finishedAt = new Date();
  await ZapRunModel.updateOne({ _id: runId }, { $set: { ...update, durationMs: Date.now() - started } });
  await ZapModel.updateOne(
    { _id: zap._id },
    {
      $set: {
        lastRunAt: finishedAt,
        lastRunStatus: outcome,
        lastRunError: outcome === 'failed' ? ((update['error'] as { message: string }).message ?? null) : null,
      },
    },
  );
  return outcome;
}

/** Runs every matched Zap independently; used after the webhook has already been answered. */
export async function runMatchedZaps(zaps: ZapDoc[], deliveryId: string, payload: unknown): Promise<RunOutcome[]> {
  const results = await Promise.allSettled(zaps.map((zap) => runZap(zap, deliveryId, payload)));
  return results.map((r) => {
    if (r.status === 'rejected') logger.error({ err: r.reason, deliveryId }, 'Zap run crashed');
    return r.status === 'fulfilled' ? r.value : 'failed';
  });
}
