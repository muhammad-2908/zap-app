import { isValidObjectId } from 'mongoose';
import { assertValidZap, type ZapShape } from '../../catalog/validate-zap.js';
import { HttpError } from '../../lib/http-error.js';
import { ZapModel, type ZapDoc } from '../../models/zap.model.js';
import { ZapRunModel, type ZapRunDoc } from '../../models/zap-run.model.js';
import { ensureHook, removeHookIfUnused } from '../hooks/hooks.service.js';
import type { CreateZapInput, UpdateZapInput } from './zaps.schema.js';

export interface ZapDto extends ZapShape {
  id: string;
  source: 'manual' | 'copilot';
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | null;
  lastRunError: string | null;
  createdAt: string;
  updatedAt: string;
}

function shapeOf(doc: ZapDoc): ZapShape {
  return {
    name: doc.name,
    enabled: doc.enabled,
    trigger: { app: doc.trigger.app, event: doc.trigger.event, config: doc.trigger.config ?? {} },
    action: { app: doc.action.app, type: doc.action.type, fields: doc.action.fields ?? {} },
  };
}

function toDto(doc: ZapDoc): ZapDto {
  return {
    id: doc._id.toString(),
    ...shapeOf(doc),
    source: doc.source,
    lastRunAt: doc.lastRunAt ? doc.lastRunAt.toISOString() : null,
    lastRunStatus: doc.lastRunStatus ?? null,
    lastRunError: doc.lastRunError ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** Repository the trigger listens on. Validated by the catalog before this is called. */
function repoOf(zap: ZapShape): string {
  return zap.trigger.config['repoFullName'] ?? '';
}

const notFound = () => new HttpError(404, 'zap_not_found', 'Zap not found');

/**
 * Every query below filters on owner. Another user's Zap id behaves exactly like a missing one
 * (404), so ids can't be probed.
 */
async function findOwned(ownerId: string, zapId: string) {
  if (!isValidObjectId(zapId)) throw notFound();
  const doc = await ZapModel.findOne({ _id: zapId, owner: ownerId });
  if (!doc) throw notFound();
  return doc;
}

function plain(doc: Awaited<ReturnType<typeof findOwned>>): ZapDoc {
  return doc.toObject() as unknown as ZapDoc;
}

export async function listZaps(ownerId: string): Promise<ZapDto[]> {
  const docs = await ZapModel.find({ owner: ownerId }).sort({ updatedAt: -1 }).lean<ZapDoc[]>();
  return docs.map(toDto);
}

export async function getZap(ownerId: string, zapId: string): Promise<ZapDto> {
  return toDto(plain(await findOwned(ownerId, zapId)));
}

export async function createZap(
  ownerId: string,
  input: CreateZapInput,
  source: 'manual' | 'copilot' = 'manual',
): Promise<ZapDto> {
  assertValidZap(input);
  // An enabled Zap must be able to fire: install the webhook first; if that fails, nothing is saved.
  if (input.enabled) await ensureHook(ownerId, repoOf(input));
  const doc = await ZapModel.create({ ...input, owner: ownerId, source });
  return toDto(doc.toObject() as unknown as ZapDoc);
}

export async function updateZap(ownerId: string, zapId: string, patch: UpdateZapInput): Promise<ZapDto> {
  const doc = await findOwned(ownerId, zapId);
  const current = shapeOf(plain(doc));
  const previousRepo = repoOf(current);

  const merged: ZapShape = {
    name: patch.name ?? current.name,
    enabled: patch.enabled ?? current.enabled,
    trigger: patch.trigger ?? current.trigger,
    action: patch.action ?? current.action,
  };
  // Validate the whole resulting Zap, not just the patch: e.g. a new trigger must still
  // provide every variable the existing comment uses.
  assertValidZap(merged);
  // Saving an enabled Zap (turning it on, or editing it while on, possibly to another repo)
  // ensures the webhook first. If GitHub refuses, the Zap is left as it was.
  if (merged.enabled) await ensureHook(ownerId, repoOf(merged));

  // trigger.key is recomputed by the model's pre-validate hook.
  doc.set({ name: merged.name, enabled: merged.enabled, trigger: merged.trigger, action: merged.action });
  doc.markModified('trigger.config');
  doc.markModified('action.fields');
  await doc.save();

  // Moved to another repository: the old repo's webhook may now be unused.
  if (previousRepo && previousRepo !== repoOf(merged)) await removeHookIfUnused(ownerId, previousRepo);
  return toDto(plain(doc));
}

/** Deletes the Zap and its run history, then removes the repo webhook if nothing else uses it. */
export async function deleteZap(ownerId: string, zapId: string): Promise<void> {
  const doc = await findOwned(ownerId, zapId);
  const repo = repoOf(shapeOf(plain(doc)));
  await ZapRunModel.deleteMany({ zap: doc._id });
  await doc.deleteOne();
  if (repo) await removeHookIfUnused(ownerId, repo);
}

export interface ZapRunDto {
  id: string;
  status: 'running' | 'success' | 'failed';
  deliveryId: string;
  repoFullName: string;
  prNumber: number;
  prUrl: string;
  commentUrl: string | null;
  renderedBody: string | null;
  error: { code: string; message: string } | null;
  durationMs: number | null;
  createdAt: string;
}

const RUNS_LIMIT = 20;

/** Most recent runs of one of the caller's Zaps (404 for anyone else's). */
export async function listRuns(ownerId: string, zapId: string): Promise<ZapRunDto[]> {
  const zap = await findOwned(ownerId, zapId);
  const runs = await ZapRunModel.find({ zap: zap._id }).sort({ createdAt: -1 }).limit(RUNS_LIMIT).lean<ZapRunDoc[]>();
  return runs.map((r) => ({
    id: r._id.toString(),
    status: r.status,
    deliveryId: r.deliveryId,
    repoFullName: r.repoFullName,
    prNumber: r.prNumber,
    prUrl: `https://github.com/${r.repoFullName}/pull/${r.prNumber}`,
    commentUrl: r.commentUrl ?? null,
    renderedBody: r.renderedBody ?? null,
    error: r.error ? { code: r.error.code, message: r.error.message } : null,
    durationMs: r.durationMs ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
