import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../src/lib/crypto.js';

describe('token encryption', () => {
  it('round-trips a value', () => {
    const enc = encryptSecret('gho_example_token');
    expect(enc).not.toContain('gho_example_token');
    expect(decryptSecret(enc)).toBe('gho_example_token');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects a tampered value', () => {
    const [v, iv, tag, ct] = encryptSecret('secret').split(':');
    const flipped = ct!.startsWith('A') ? `B${ct!.slice(1)}` : `A${ct!.slice(1)}`;
    expect(() => decryptSecret([v, iv, tag, flipped].join(':'))).toThrow();
  });

  it('rejects an unknown format', () => {
    expect(() => decryptSecret('plain-text')).toThrow('Unsupported encrypted value');
  });
});
