import { describe, expect, it } from 'vitest';
import { findZapIssues, type ZapShape } from '../src/catalog/validate-zap.js';

const valid = (): ZapShape => ({
  name: 'Thank PR authors',
  enabled: false,
  trigger: { app: 'github', event: 'pull_request.opened', config: { repoFullName: 'octocat/hello-world' } },
  action: { app: 'github', type: 'pull_request.comment', fields: { body: 'Thanks @{{pr.author}}!' } },
});

const paths = (zap: ZapShape) => findZapIssues(zap).map((i) => i.path);

describe('validateZap against the catalog', () => {
  it('accepts the GitHub PR opened -> comment Zap', () => {
    expect(findZapIssues(valid())).toEqual([]);
  });

  it('rejects coming-soon apps', () => {
    const zap = valid();
    zap.trigger.app = 'gitlab';
    zap.action.app = 'slack';
    expect(paths(zap)).toEqual(['trigger.app', 'action.app']);
  });

  it('rejects unknown apps, events and actions', () => {
    const zap = valid();
    zap.trigger.event = 'push';
    zap.action.type = 'merge';
    expect(paths(zap)).toEqual(['trigger.event', 'action.type']);
    zap.trigger.app = 'nope';
    expect(paths(zap)[0]).toBe('trigger.app');
  });

  it('requires a repository in owner/name form', () => {
    const zap = valid();
    zap.trigger.config = {};
    expect(paths(zap)).toEqual(['trigger.config.repoFullName']);
    zap.trigger.config = { repoFullName: 'not a repo' };
    expect(paths(zap)).toEqual(['trigger.config.repoFullName']);
  });

  it('requires a comment and rejects blank ones', () => {
    const zap = valid();
    zap.action.fields = { body: '   ' };
    expect(findZapIssues(zap)).toEqual([{ path: 'action.fields.body', message: 'Comment is required' }]);
  });

  it('rejects variables the trigger does not provide', () => {
    const zap = valid();
    zap.action.fields = { body: 'Hi {{pr.author}} {{issue.title}}' };
    expect(findZapIssues(zap)).toEqual([{ path: 'action.fields.body', message: 'Unknown data: {{issue.title}}' }]);
  });

  it('rejects unknown fields and over-long values', () => {
    const zap = valid();
    zap.action.fields = { body: 'x'.repeat(65_537), extra: 'y' };
    expect(paths(zap)).toEqual(['action.fields.extra', 'action.fields.body']);
  });
});
