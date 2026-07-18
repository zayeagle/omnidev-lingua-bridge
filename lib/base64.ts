/** Base64 helpers resilient to whitespace / URL-safe alphabet. */

export function sanitizeBase64(input: string): string {
  let s = input.trim().replace(/\s+/g, '');
  // URL-safe → standard
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  // Drop anything outside the alphabet (keeps = padding)
  s = s.replace(/[^A-Za-z0-9+/=]/g, '');
  // Pad to multiple of 4
  const mod = s.length % 4;
  if (mod === 1) {
    // Invalid length — truncate last junk char
    s = s.slice(0, -1);
  } else if (mod) {
    s += '='.repeat(4 - mod);
  }
  return s;
}

export function base64ToBytes(input: string): Uint8Array {
  const s = sanitizeBase64(input);
  if (!s) return new Uint8Array(0);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Decode many base64 chunks and concatenate raw bytes, then re-encode once. */
export function joinBase64Chunks(chunks: string[]): string {
  if (!chunks.length) return '';
  const parts = chunks.map(base64ToBytes).filter((b) => b.length > 0);
  if (!parts.length) return '';
  const total = parts.reduce((n, p) => n + p.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    merged.set(p, off);
    off += p.length;
  }
  return bytesToBase64(merged);
}
