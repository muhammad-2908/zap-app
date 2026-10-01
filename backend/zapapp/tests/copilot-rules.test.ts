import { describe, expect, it } from 'vitest';
import { parseWithRules } from '../src/modules/copilot/rules-parser.js';

const REPOS = ['alice/zap-test', 'alice/website'];

describe('rule-based Copilot parser', () => {
  it('handles the example from the brief', () => {
    const raw = parseWithRules('When a pull request is opened, comment thanks.', REPOS);
    expect(raw).toMatchObject({
      feasible: true,
      name: 'Thank pull request authors',
      triggerApp: 'github',
      triggerEvent: 'pull_request.opened',
      actionApp: 'github',
      actionType: 'pull_request.comment',
      actionFields: { body: 'Thanks @{{pr.author}} for opening #{{pr.number}}!' },
      repoFullName: null,
    });
  });

  it('uses quoted text as the comment and finds a named repo', () => {
    const raw = parseWithRules('When a PR opens on zap-test, comment "Looking at this soon!"', REPOS);
    expect(raw.actionFields['body']).toBe('Looking at this soon!');
    expect(raw.repoFullName).toBe('alice/zap-test');
  });

  it('uses the text after "comment" when not quoted', () => {
    const raw = parseWithRules('on new pull requests in alice/website comment please add a changelog entry', REPOS);
    expect(raw.actionFields['body']).toBe('Please add a changelog entry');
    expect(raw.repoFullName).toBe('alice/website');
  });

  it('refuses apps that are not available yet', () => {
    const raw = parseWithRules('When a PR is opened, post a message to Slack', REPOS);
    expect(raw.feasible).toBe(false);
    expect(raw.reason).toContain('Slack');
  });

  it('refuses requests it does not understand', () => {
    expect(parseWithRules('Every Monday send me a report', REPOS).feasible).toBe(false);
  });
});
