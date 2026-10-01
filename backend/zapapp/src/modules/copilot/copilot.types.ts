import type { ZapShape } from '../../catalog/validate-zap.js';

export interface CopilotDraft {
  draft: ZapShape;
  /** Things the user should check or fill in before saving (e.g. "Pick a repository"). */
  warnings: string[];
  /** Which engine produced the draft. */
  mode: 'llm' | 'rules';
}

/** Model- or parser-level interpretation of the request, before normalization. */
export interface RawDraft {
  feasible: boolean;
  reason: string;
  name: string;
  triggerApp: string;
  triggerEvent: string;
  repoFullName: string | null;
  actionApp: string;
  actionType: string;
  actionFields: Record<string, string>;
}
