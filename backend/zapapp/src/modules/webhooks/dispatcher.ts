import type { Types } from 'mongoose';
import { triggerKey } from '../../catalog/catalog.js';
import { ZapModel, type ZapDoc } from '../../models/zap.model.js';
import { findHookById } from '../hooks/hooks.service.js';

export interface PullRequestOpenedPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    user: { login: string };
    head: { ref: string };
    base: { ref: string };
  };
  repository: { full_name: string; name: string };
}

export interface DispatchResult {
  owner: Types.ObjectId | null;
  zaps: ZapDoc[];
}

/**
 * Which Zaps should run for this delivery?
 * The hook id identifies whose webhook fired (two users can each have a hook on the same repo),
 * then we take that owner's enabled Zaps for this trigger on this repository.
 */
export async function findZapsForPullRequestOpened(
  hookId: number,
  payload: PullRequestOpenedPayload,
): Promise<DispatchResult> {
  const hook = await findHookById(hookId);
  if (!hook) return { owner: null, zaps: [] };

  const zaps = await ZapModel.find({
    owner: hook.owner,
    enabled: true,
    'trigger.key': triggerKey('github', 'pull_request.opened'),
    'trigger.config.repoFullName': payload.repository.full_name,
  }).lean<ZapDoc[]>();

  return { owner: hook.owner, zaps };
}
