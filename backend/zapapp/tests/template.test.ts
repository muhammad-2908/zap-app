import { describe, expect, it } from 'vitest';
import { extractVariables, renderTemplate } from '../src/lib/template.js';

describe('template', () => {
  it('extracts variables once, in order, allowing spaces', () => {
    expect(extractVariables('Hi {{pr.author}} #{{ pr.number }} {{pr.author}}')).toEqual(['pr.author', 'pr.number']);
  });

  it('renders known values and blanks unknown ones', () => {
    const ctx = { pr: { author: 'alice', number: 7 } };
    expect(renderTemplate('Thanks @{{pr.author}} for #{{pr.number}}{{pr.missing}}!', ctx)).toBe(
      'Thanks @alice for #7!',
    );
  });

  it('never walks the prototype chain', () => {
    expect(renderTemplate('{{constructor.name}}|{{__proto__}}|{{pr.toString}}', { pr: {} })).toBe('||');
  });

  it('leaves non-variable braces alone', () => {
    expect(renderTemplate('{ not } {{ }} {{a b}}', {})).toBe('{ not } {{ }} {{a b}}');
  });
});
