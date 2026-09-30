import type { ZapDoc } from '../../models/zap.model.js';

/** Data a trigger exposes to templates, e.g. { pr: { author: 'alice' }, repo: { full_name: 'a/b' } }. */
export type TriggerContext = Record<string, Record<string, string | number>>;

/** Where the action should act (the PR that fired the Zap). */
export interface ActionTarget {
  repoFullName: string;
  prNumber: number;
}

export interface TriggerHandler<P> {
  /** Turns the raw webhook payload into the template context. */
  buildContext(payload: P): TriggerContext;
  /** Identifies the object the run is about (for run history and the action). */
  target(payload: P): ActionTarget;
}

export interface ActionResult {
  renderedBody: string;
  commentUrl: string;
}

export interface ActionHandler {
  execute(input: { zap: ZapDoc; context: TriggerContext; target: ActionTarget; token: string }): Promise<ActionResult>;
}

/** A failure with a stable code, recorded on the run and shown on the Zap list. */
export class RunError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'RunError';
    this.code = code;
    this.status = status;
  }
}
