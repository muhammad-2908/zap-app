import { GitHubError, githubRequest } from '../../../lib/github-client.js';
import { renderTemplate } from '../../../lib/template.js';
import { RunError, type ActionHandler } from '../types.js';

const RETRY_DELAY_MS = 1000;

export const retryPolicy = { delayMs: RETRY_DELAY_MS };

const isTransient = (err: unknown) =>
  (err instanceof GitHubError && err.status >= 500) || (err instanceof Error && !(err instanceof GitHubError));

/**
 * github:pull_request.comment — renders the comment template and posts it on the PR.
 * PRs are issues in GitHub's API, so comments go to /issues/{number}/comments.
 * One retry for 5xx/network errors; 4xx is final.
 */
export const githubPullRequestComment: ActionHandler = {
  async execute({ zap, context, target, token }) {
    const renderedBody = renderTemplate(zap.action.fields['body'] ?? '', context).trim();
    if (!renderedBody) {
      throw new RunError('empty_comment', 'The comment is empty after filling in the pull request data');
    }

    const post = () =>
      githubRequest<{ html_url: string }>(token, `/repos/${target.repoFullName}/issues/${target.prNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: renderedBody }),
      });

    let comment: { html_url: string };
    try {
      comment = await post();
    } catch (err) {
      if (!isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, retryPolicy.delayMs));
      comment = await post();
    }
    return { renderedBody, commentUrl: comment.html_url };
  },
};
