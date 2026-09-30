import { isValidObjectId } from 'mongoose';
import { assertValidZap, type ZapShape } from '../../catalog/validate-zap.js';
import { HttpError } from '../../lib/http-error.js';
import { ZapModel, type ZapDoc } from '../../models/zap.model.js';
import { ensureHook } from '../hooks/hooks.service.js';
import type { CreateZapInput, UpdateZapInput } from './zaps.schema.js';

export interface ZapDto extends ZapShape {
  id: string;
  source: 'manual' | 'copilot';
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | null;
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
  return toDto(plain(doc));
}
