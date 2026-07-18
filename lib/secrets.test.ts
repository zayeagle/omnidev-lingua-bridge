import { describe, expect, it } from 'vitest';
import { containsApiKey, maskApiKey, resolveApiKeyInput } from './secrets';

describe('secrets', () => {
  it('masks long keys keeping last 4', () => {
    expect(maskApiKey('sk-abcdefghijklmnop')).toMatch(/op$/);
    expect(maskApiKey('sk-abcdefghijklmnop')).not.toContain('sk-abcdef');
  });

  it('resolveApiKeyInput keeps existing when blank', () => {
    expect(resolveApiKeyInput('', 'sk-keep')).toBe('sk-keep');
    expect(resolveApiKeyInput('   ', 'sk-keep')).toBe('sk-keep');
    expect(resolveApiKeyInput('sk-new', 'sk-keep')).toBe('sk-new');
  });

  it('containsApiKey detects exact leak', () => {
    expect(containsApiKey('err sk-secret-key here', 'sk-secret-key')).toBe(true);
    expect(containsApiKey('clean message', 'sk-secret-key')).toBe(false);
  });
});
