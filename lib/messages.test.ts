import { describe, expect, it } from 'vitest';
import {
  isExtensionPageSender,
  validateExtensionRequest,
  validateSecurityRequest,
  MAX_TRANSLATE_BATCH,
} from './messages';

describe('messages validators (F32 UNIT)', () => {
  it('TC-S-U04 rejects oversized translate batch', () => {
    const texts = Array.from({ length: MAX_TRANSLATE_BATCH + 1 }, () => 'a');
    expect(
      validateExtensionRequest({ type: 'ai.translate', texts, targetLang: 'zh' }),
    ).toMatch(/最多/);
  });

  it('rejects huge audioBase64', () => {
    expect(
      validateExtensionRequest({
        type: 'ai.transcribe',
        audioBase64: 'x'.repeat(2_000_001),
        mimeType: 'audio/pcm',
      }),
    ).toMatch(/过大/);
  });

  it('TC-S3-U01: extension page sender requires matching runtime id', () => {
    const extId = 'ext-lingua';
    expect(isExtensionPageSender({ tab: { id: 1 }, id: extId }, extId)).toBe(
      false,
    );
    expect(isExtensionPageSender({ id: 'other' }, extId)).toBe(false);
    expect(isExtensionPageSender({}, extId)).toBe(false);
    expect(isExtensionPageSender({ id: extId }, extId)).toBe(true);
  });

  it('unlock requires passphrase', () => {
    expect(
      validateSecurityRequest({ type: 'security.unlock', passphrase: '' }),
    ).toMatch(/口令/);
  });
});
