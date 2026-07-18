import { describe, expect, it } from 'vitest';
import { allowFreeTextFallback } from './pipeline-policy';
import { isExtensionPageSender } from './messages';

describe('pipeline-policy (F34 INT)', () => {
  it('TC-S3-I01: locked / incomplete_iflytek deny Libre fallback', () => {
    expect(allowFreeTextFallback('locked')).toBe(false);
    expect(allowFreeTextFallback('incomplete_iflytek')).toBe(false);
    expect(allowFreeTextFallback('missing_key')).toBe(true);
  });

  it('TC-S3-I02: security.unlock wrong sender.id denied', () => {
    const extId = 'lingua-bridge';
    expect(isExtensionPageSender({ id: 'evil-ext' }, extId)).toBe(false);
    expect(isExtensionPageSender({ id: extId, tab: { id: 9 } }, extId)).toBe(
      false,
    );
    expect(isExtensionPageSender({ id: extId }, extId)).toBe(true);
  });
});
