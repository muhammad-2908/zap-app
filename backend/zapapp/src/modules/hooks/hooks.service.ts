import { env } from '../../config/env.js';
import { GitHubError, githubRequest } from '../../lib/github-client.js';
import { HttpError } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { RepoHookModel, type RepoHookDoc } from '../../models/repo-hook.model.js';
import { withUserToken } from '../github/github.service.js';

interface GitHubHook {
  id: number;
  active: boolean;
  events: string[];
  config: { url?: string };
}

/** The hook configuration we want on GitHub. Re-sent on every ensure so URL/secret changes self-heal. */
function desiredHook() {
  return {
    active: true,
    events: ['pull_request'],
    config: {
      url: env.PUBLIC_WEBHOOK_URL,
      content_type: 'json',
      secret: env.GITHUB_WEBHOOK_SECRET,
      insecure_ssl: '0',
    },
  };
}

function installFailed(repo: string, err: GitHubError): HttpError {
  if (err.status === 404 || err.status === 403) {
    return new HttpError(
      422,
      'hook_install_failed',
      `Can't install the webhook on ${repo}. You need admin access to the repository.`,
    );
  }
  return new HttpError(502, 'github_error', `GitHub refused the webhook for ${repo}: ${err.message}`);
}

async function updateHook(token: string, repo: string, hookId: number): Promise<GitHubHook> {
  return githubRequest<GitHubHook>(token, `/repos/${repo}/hooks/${hookId}`, {
    method: 'PATCH',
    body: JSON.stringify(desiredHook()),
  });
}

async function createHook(token: string, repo: string): Promise<GitHubHook> {
  try {
    return await githubRequest<GitHubHook>(token, `/repos/${repo}/hooks`, {
      method: 'POST',
      body: JSON.stringify({ name: 'web', ...desiredHook() }),
    });
  } catch (err) {
    // A hook with our URL already exists (e.g. our record was lost): adopt it and reset its secret.
    const exists =
      err instanceof GitHubError &&
      err.status === 422 &&
      err.errors.some((e) => /already exists/i.test(e.message ?? ''));
    if (!exists) throw err;

    const hooks = await githubRequest<GitHubHook[]>(token, `/repos/${repo}/hooks?per_page=100`);
    const ours = hooks.find((h) => h.config.url === env.PUBLIC_WEBHOOK_URL);
    if (!ours) throw err;
    return updateHook(token, repo, ours.id);
  }
}

/**
 * Makes sure `repo` has our webhook and that we know its id. Called before a Zap is saved as enabled.
 * Idempotent: a second Zap on the same repo reuses the hook; a hook deleted on GitHub is recreated;
 * a changed PUBLIC_WEBHOOK_URL or secret is pushed to the existing hook.
 */
export async function ensureHook(userId: string, repo: string): Promise<RepoHookDoc> {
  const existing = await RepoHookModel.findOne({ owner: userId, repoFullName: repo }).lean<RepoHookDoc>();

  const hook = await withUserToken(userId, async (token) => {
    try {
      if (existing) {
        try {
          return await updateHook(token, repo, existing.hookId);
        } catch (err) {
          // Deleted on GitHub since we created it: fall through and create a new one.
          if (!(err instanceof GitHubError && err.status === 404)) throw err;
        }
      }
      return await createHook(token, repo);
    } catch (err) {
      if (err instanceof GitHubError && err.status !== 401) throw installFailed(repo, err);
      throw err;
    }
  });

  const saved = await RepoHookModel.findOneAndUpdate(
    { owner: userId, repoFullName: repo },
    { $set: { hookId: hook.id, url: env.PUBLIC_WEBHOOK_URL } },
    { upsert: true, returnDocument: 'after' },
  ).lean<RepoHookDoc>();

  logger.info(
    { userId, repo, hookId: hook.id, reused: existing?.hookId === hook.id },
    existing?.hookId === hook.id ? 'Webhook verified' : 'Webhook installed',
  );
  return saved!;
}

export async function findHookById(hookId: number): Promise<RepoHookDoc | null> {
  return RepoHookModel.findOne({ hookId }).lean<RepoHookDoc>();
}
