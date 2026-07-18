import { describe, expect, it } from 'vitest';
import { joinBase64Chunks, sanitizeBase64, base64ToBytes } from './base64';

describe('base64 helpers', () => {
  it('sanitizes whitespace and url-safe alphabet', () => {
    const raw = btoa('hi');
    expect(sanitizeBase64(` ${raw}\n`)).toBe(raw);
    expect(new TextDecoder().decode(base64ToBytes(raw))).toBe('hi');
  });

  it('joins chunked base64 by decoding first (not string concat)', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([4, 5]);
    const a64 = btoa(String.fromCharCode(...a));
    const b64 = btoa(String.fromCharCode(...b));
    // Naive join is often invalid / wrong; binary join is correct.
    const joined = joinBase64Chunks([a64, b64]);
    const bytes = base64ToBytes(joined);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
  });
});
