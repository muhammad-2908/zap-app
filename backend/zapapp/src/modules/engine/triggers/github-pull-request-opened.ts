import type { PullRequestOpenedPayload } from '../../webhooks/dispatcher.js';
import type { TriggerHandler } from '../types.js';

/** github:pull_request.opened — variables match the catalog's PR_VARIABLES. */
export const githubPullRequestOpened: TriggerHandler<PullRequestOpenedPayload> = {
  buildContext(payload) {
    const pr = payload.pull_request;
    return {
      pr: {
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        author: pr.user.login,
        head: pr.head.ref,
        base: pr.base.ref,
      },
      repo: {
        full_name: payload.repository.full_name,
        name: payload.repository.name,
      },
    };
  },
  target(payload) {
    return { repoFullName: payload.repository.full_name, prNumber: payload.pull_request.number };
  },
};
