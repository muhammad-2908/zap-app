import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies GitHub's X-Hub-Signature-256 header ("sha256=<hex HMAC of the raw body>").
 * Must run on the exact bytes GitHub sent, before any JSON parsing.
 */
export function verifyGithubSignature(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const received = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  // Length check first: timingSafeEqual throws on different lengths.
  return received.length === expected.length && timingSafeEqual(received, expected);
}
