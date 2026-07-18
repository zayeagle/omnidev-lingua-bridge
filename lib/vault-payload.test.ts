import { describe, expect, it } from 'vitest';
import { parseVaultPayload, serializeVaultPayload } from './vault-payload';

describe('vault-payload (F31 UNIT)', () => {
  it('TC-S-U02 roundtrip JSON vault', () => {
    const raw = serializeVaultPayload({
      apiKey: 'k',
      iflytekApiSecret: 'sec',
    });
    expect(parseVaultPayload(raw)).toEqual({
      apiKey: 'k',
      iflytekApiSecret: 'sec',
    });
  });

  it('legacy bare apiKey still parses', () => {
    expect(parseVaultPayload('sk-old')).toEqual({
      apiKey: 'sk-old',
      iflytekApiSecret: '',
    });
  });
});
