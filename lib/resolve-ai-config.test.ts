import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SECURITY,
  DEFAULT_SETTINGS,
  type ExtensionSettings,
} from './storage';
import { clearUnlockedApiKey } from './key-session';

const getValue = vi.fn();
const setValue = vi.fn();

vi.mock('wxt/storage', () => ({
  storage: {
    defineItem: () => ({
      getValue: (...args: unknown[]) => getValue(...args),
      setValue: (...args: unknown[]) => setValue(...args),
    }),
  },
}));

describe('resolveAiConfigForRequest (F34 UNIT)', () => {
  beforeEach(() => {
    clearUnlockedApiKey();
    getValue.mockReset();
    setValue.mockReset();
  });

  afterEach(() => {
    clearUnlockedApiKey();
    vi.resetModules();
  });

  it('TC-S3-U03: hardened vault without SW unlock → reason locked', async () => {
    const stored: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      security: {
        ...DEFAULT_SECURITY,
        hardeningEnabled: true,
        saltB64: 's',
        ivB64: 'i',
        cipherB64: 'c',
      },
      aiConfig: { ...DEFAULT_SETTINGS.aiConfig, apiKey: '' },
    };
    getValue.mockResolvedValue(stored);

    const { resolveAiConfigForRequest } = await import('./settings-store');
    const resolved = await resolveAiConfigForRequest();
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toBe('locked');
      expect(resolved.error).toMatch(/解锁/);
    }
  });

  it('missing plaintext key → reason missing_key', async () => {
    const stored: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      security: { ...DEFAULT_SECURITY },
      aiConfig: { ...DEFAULT_SETTINGS.aiConfig, apiKey: '' },
    };
    getValue.mockResolvedValue(stored);

    const { resolveAiConfigForRequest } = await import('./settings-store');
    const resolved = await resolveAiConfigForRequest();
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.reason).toBe('missing_key');
    }
  });
});
