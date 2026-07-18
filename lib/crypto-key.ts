/** Web Crypto helpers for optional API Key encrypt-at-rest. */

const PBKDF2_ITERS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function b64Encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function b64Decode(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export type EncryptedBlob = {
  saltB64: string;
  ivB64: string;
  cipherB64: string;
};

export async function encryptSecret(plaintext: string, passphrase: string): Promise<EncryptedBlob> {
  if (!passphrase.trim()) throw new Error('加密口令不能为空');
  if (!plaintext.trim()) throw new Error('API Key 不能为空');
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveAesKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    saltB64: b64Encode(salt),
    ivB64: b64Encode(iv),
    cipherB64: b64Encode(cipher),
  };
}

export async function decryptSecret(blob: EncryptedBlob, passphrase: string): Promise<string> {
  if (!passphrase.trim()) throw new Error('请输入加密口令');
  try {
    const salt = b64Decode(blob.saltB64);
    const iv = b64Decode(blob.ivB64);
    const cipher = b64Decode(blob.cipherB64);
    const key = await deriveAesKey(passphrase, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('口令错误或数据损坏，无法解密');
  }
}

export function emptyVault(): EncryptedBlob & { hardeningEnabled: boolean } {
  return {
    hardeningEnabled: false,
    saltB64: '',
    ivB64: '',
    cipherB64: '',
  };
}

/**
 * Cryptographically random passphrase for optional encrypt-at-rest.
 * Uses URL-safe base64 (no padding) so users can copy/paste easily.
 */
export function generatePassphrase(byteLength = 24): string {
  const n = Math.max(16, Math.min(64, byteLength));
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
