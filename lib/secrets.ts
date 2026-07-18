/** API Key handling helpers (no I/O). */

/** Display hint only — never a reversible encoding. */
export function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${'•'.repeat(Math.min(12, key.length - 4))}${key.slice(-4)}`;
}

/**
 * Options form: empty / whitespace input means "keep existing key".
 * Non-empty input replaces the stored key.
 */
export function resolveApiKeyInput(input: string | undefined, existing: string): string {
  const trimmed = (input ?? '').trim();
  return trimmed || existing.trim();
}

/** True if haystack contains the exact key (after trim). */
export function containsApiKey(haystack: string, apiKey: string): boolean {
  const key = apiKey.trim();
  return key.length > 0 && haystack.includes(key);
}
