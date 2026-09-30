import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyGithubSignature } from '../src/lib/webhook-signature.js';

const secret = "It's a Secret to Everybody";
const body = Buffer.from('Hello, World!');

describe('verifyGithubSignature', () => {
  it('accepts the example from GitHub\'s documentation', () => {
    const header = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';
    expect(verifyGithubSignature(body, header, secret)).toBe(true);
  });

  it('accepts a signature computed with the same secret', () => {
    const header = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
    expect(verifyGithubSignature(body, header, 's3cret')).toBe(true);
  });

  it('rejects a wrong secret, a changed body, a missing header and the old sha1 format', () => {
    const header = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
    expect(verifyGithubSignature(body, header, 'other')).toBe(false);
    expect(verifyGithubSignature(Buffer.from('Hello, World?'), header, 's3cret')).toBe(false);
    expect(verifyGithubSignature(body, undefined, 's3cret')).toBe(false);
    expect(verifyGithubSignature(body, 'sha1=abcd', 's3cret')).toBe(false);
  });

  it('rejects a truncated signature without throwing', () => {
    expect(verifyGithubSignature(body, 'sha256=abcd', secret)).toBe(false);
  });
});
