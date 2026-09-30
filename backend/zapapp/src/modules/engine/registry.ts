import { githubPullRequestComment } from './actions/github-pull-request-comment.js';
import { githubPullRequestOpened } from './triggers/github-pull-request-opened.js';
import type { ActionHandler, TriggerHandler } from './types.js';

/**
 * Runnable integrations, keyed "app:id" like the catalog. The catalog says what can be configured;
 * this registry says what can actually run. Adding GitLab = a catalog entry + a handler here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TRIGGERS: Record<string, TriggerHandler<any>> = {
  'github:pull_request.opened': githubPullRequestOpened,
};

export const ACTIONS: Record<string, ActionHandler> = {
  'github:pull_request.comment': githubPullRequestComment,
};
