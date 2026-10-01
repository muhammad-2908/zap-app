import { describe, expect, it } from 'vitest';
import { buildSchema, systemPrompt } from '../src/modules/copilot/llm.js';

describe('Copilot structured-output schema', () => {
  it('only offers runnable apps and the user\'s repos, strictly', () => {
    const schema = buildSchema(['alice/zap-test']) as {
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { enum?: string[]; description?: string; properties?: object; required?: string[] }>;
    };
    expect(schema.additionalProperties).toBe(false);
    // Strict mode requires every property to be listed as required.
    expect(schema.required.sort()).toEqual(Object.keys(schema.properties).sort());
    expect(schema.properties['triggerApp']!.enum).toEqual(['github']);
    expect(schema.properties['actionType']!.enum).toEqual(['pull_request.comment']);
    expect(schema.properties['repoFullName']!.description).toContain('alice/zap-test');
    expect(schema.properties['actionFields']!.required).toEqual(['body']);
  });

  it('tells the model which apps are not available yet', () => {
    expect(systemPrompt()).toContain('Not available yet: GitLab, Bitbucket, Jira, Slack, Linear');
  });
});
