/** Encrypted vault body: API Key (+ optional iFlytek APISecret). */

export type VaultPayload = {
  apiKey: string;
  iflytekApiSecret: string;
};

/** Serialize secrets for AES-GCM (v1 JSON). */
export function serializeVaultPayload(p: VaultPayload): string {
  return JSON.stringify({
    v: 1,
    apiKey: p.apiKey,
    iflytekApiSecret: p.iflytekApiSecret ?? '',
  });
}

/**
 * Parse vault plaintext. Legacy ciphertexts were bare API Key strings.
 */
export function parseVaultPayload(plain: string): VaultPayload {
  const t = plain.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as {
        apiKey?: unknown;
        iflytekApiSecret?: unknown;
      };
      if (typeof j.apiKey === 'string') {
        return {
          apiKey: j.apiKey,
          iflytekApiSecret:
            typeof j.iflytekApiSecret === 'string' ? j.iflytekApiSecret : '',
        };
      }
    } catch {
      /* fall through to legacy */
    }
  }
  return { apiKey: plain, iflytekApiSecret: '' };
}
