import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, generatePassphrase } from './crypto-key';

describe('crypto-key (F10)', () => {
  it('TC-F10-U01 roundtrip', async () => {
    const blob = await encryptSecret('sk-secret-xyz', 'pass-phrase-1');
    expect(blob.cipherB64).toBeTruthy();
    expect(await decryptSecret(blob, 'pass-phrase-1')).toBe('sk-secret-xyz');
  });

  it('TC-F10-U02 wrong passphrase fails', async () => {
    const blob = await encryptSecret('sk-secret-xyz', 'correct');
    await expect(decryptSecret(blob, 'wrong')).rejects.toThrow(/口令/);
  });

  it('generatePassphrase is random and usable for encrypt', async () => {
    const a = generatePassphrase();
    const b = generatePassphrase();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(20);
    const blob = await encryptSecret('sk-x', a);
    expect(await decryptSecret(blob, a)).toBe('sk-x');
  });
});
