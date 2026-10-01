import type { RawDraft } from './copilot.types.js';

const THANKS_TEMPLATE = 'Thanks @{{pr.author}} for opening #{{pr.number}}!';
const UNSUPPORTED_APPS = /\b(slack|jira|gitlab|bitbucket|linear|discord|teams|email)\b/i;

function mentionsPullRequestOpened(text: string): boolean {
  return /\b(pull requests?|prs?)\b/i.test(text) && /\b(open|opens|opened|opening|created|new)\b/i.test(text);
}

function extractComment(text: string): string | null {
  const quoted = text.match(/["“']([^"”']{2,})["”']/);
  if (quoted?.[1]) return quoted[1].trim();
  const after = text.match(/\b(?:comment(?:ing)?|reply(?:ing)?|say(?:ing)?|post(?:ing)?|write)\b(?:\s+(?:with|that|saying|:))?\s+(.+)$/i);
  if (!after?.[1]) return null;
  return after[1].replace(/[.!\s]+$/, '').trim() || null;
}

function toCommentBody(raw: string | null): string {
  if (!raw) return THANKS_TEMPLATE;
  const words = raw.split(/\s+/);
  // "comment thanks" / "say thank you": a friendly default beats a bare word.
  if (words.length <= 3 && /thank/i.test(raw)) return THANKS_TEMPLATE;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Deterministic fallback for when no LLM is configured (or it fails). Understands the one runnable
 * shape: "when a PR is opened, comment <text>", optionally naming one of the user's repositories.
 */
export function parseWithRules(prompt: string, repos: string[]): RawDraft {
  const repo =
    repos.find((r) => prompt.toLowerCase().includes(r.toLowerCase())) ??
    repos.find((r) => new RegExp(`\\b${escapeRegExp(r.split('/')[1] ?? '')}\\b`, 'i').test(prompt)) ??
    null;

  const unsupported = prompt.match(UNSUPPORTED_APPS)?.[1];
  const feasible = mentionsPullRequestOpened(prompt) && /\b(comment|reply|say|post|thank|write)/i.test(prompt);

  const body = toCommentBody(extractComment(prompt));
  return {
    feasible: feasible && !unsupported,
    reason: unsupported
      ? `${unsupported[0]!.toUpperCase()}${unsupported.slice(1)} isn't available yet. Only GitHub can run today.`
      : feasible
        ? ''
        : 'I can build Zaps of the form "when a pull request is opened, comment …" for now.',
    name: body === THANKS_TEMPLATE ? 'Thank pull request authors' : 'Comment on new pull requests',
    triggerApp: 'github',
    triggerEvent: 'pull_request.opened',
    repoFullName: repo,
    actionApp: 'github',
    actionType: 'pull_request.comment',
    actionFields: { body },
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
