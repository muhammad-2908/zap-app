import { findZapIssues, type ZapShape } from '../../catalog/validate-zap.js';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { listAdminRepos } from '../github/github.service.js';
import type { CopilotDraft, RawDraft } from './copilot.types.js';
import { draftWithLlm, isLlmConfigured } from './llm.js';
import { parseWithRules } from './rules-parser.js';

const lower = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

/**
 * Turns the raw interpretation into a Zap draft the builder can load:
 * never enabled, repo only if it's one of the user's admin repos, validated against the catalog.
 */
export function normalize(raw: RawDraft, repos: string[]): { draft: ZapShape; warnings: string[] } {
  const warnings: string[] = [];
  // Structured output enums may differ in case; compare case-insensitively.
  const repo = repos.find((r) => lower(r) === lower(raw.repoFullName)) ?? '';
  if (!repo) warnings.push('Pick the repository this Zap should watch.');

  const draft: ZapShape = {
    name: (raw.name || 'Comment on new pull requests').trim().slice(0, 100),
    enabled: false,
    trigger: { app: lower(raw.triggerApp), event: lower(raw.triggerEvent), config: { repoFullName: repo } },
    action: {
      app: lower(raw.actionApp),
      type: lower(raw.actionType),
      fields: Object.fromEntries(Object.entries(raw.actionFields ?? {}).map(([k, v]) => [k, String(v ?? '')])),
    },
  };

  // The missing repo is expected (the user picks it); anything else is worth surfacing.
  for (const issue of findZapIssues(draft)) {
    if (issue.path !== 'trigger.config.repoFullName') warnings.push(issue.message);
  }
  return { draft, warnings };
}

// Small in-memory rate limit: the LLM costs money and a draft is a deliberate action.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

export function resetRateLimit(): void {
  hits.clear();
}

function checkRateLimit(userId: string): void {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    throw new HttpError(429, 'copilot_rate_limited', 'Too many Copilot requests. Try again in a minute.');
  }
  recent.push(now);
  hits.set(userId, recent);
}

export async function draftZap(userId: string, prompt: string): Promise<CopilotDraft> {
  checkRateLimit(userId);
  const log = logger.child({ userId, prompt: prompt.slice(0, 80) });

  let repos: string[] = [];
  try {
    repos = (await listAdminRepos(userId)).map((r) => r.fullName);
  } catch (err) {
    // Reauth errors should reach the UI; other GitHub hiccups just mean "no repo suggestion".
    if (err instanceof HttpError && err.status === 401) throw err;
    log.warn({ err }, 'Copilot: could not load repositories');
  }

  let raw: RawDraft;
  let mode: CopilotDraft['mode'] = 'rules';
  const extraWarnings: string[] = [];
  if (isLlmConfigured()) {
    try {
      raw = await draftWithLlm(prompt, repos);
      mode = 'llm';
    } catch (err) {
      log.warn({ err }, 'Copilot: LLM failed, using the rule-based parser');
      raw = parseWithRules(prompt, repos);
      extraWarnings.push('The AI Copilot was unavailable, so a simple parser drafted this. Check it carefully.');
    }
  } else {
    raw = parseWithRules(prompt, repos);
  }

  if (!raw.feasible) {
    throw new HttpError(422, 'copilot_unsupported', raw.reason || "That automation isn't supported yet.");
  }

  const { draft, warnings } = normalize(raw, repos);
  log.info({ mode, warnings: warnings.length }, 'Copilot drafted a Zap');
  return { draft, warnings: [...extraWarnings, ...warnings], mode };
}
