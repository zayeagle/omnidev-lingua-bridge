/** In-memory unlocked secrets for the service worker lifetime. */

let unlockedApiKey: string | null = null;
let unlockedIflytekApiSecret: string | null = null;

export function setUnlockedApiKey(key: string | null): void {
  unlockedApiKey = key && key.trim() ? key.trim() : null;
  if (!unlockedApiKey) unlockedIflytekApiSecret = null;
}

export function setUnlockedVault(opts: {
  apiKey: string;
  iflytekApiSecret?: string;
}): void {
  unlockedApiKey = opts.apiKey.trim() ? opts.apiKey.trim() : null;
  unlockedIflytekApiSecret = (opts.iflytekApiSecret ?? '').trim() || null;
}

export function getUnlockedApiKey(): string | null {
  return unlockedApiKey;
}

export function getUnlockedIflytekApiSecret(): string | null {
  return unlockedIflytekApiSecret;
}

export function isSessionUnlocked(): boolean {
  return !!unlockedApiKey;
}

export function clearUnlockedApiKey(): void {
  unlockedApiKey = null;
  unlockedIflytekApiSecret = null;
}
