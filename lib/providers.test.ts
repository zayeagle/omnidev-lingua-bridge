import { describe, expect, it } from 'vitest';
import { getProvider, inferProviderId, PROVIDERS, supportsStt, supportsTts } from './providers';

describe('providers', () => {
  it('lists mainstream vendors', () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(['openai', 'deepseek', 'anthropic', 'openrouter', 'iflytek', 'custom']),
    );
  });

  it('infers host → provider', () => {
    expect(inferProviderId('https://api.openai.com/v1')).toBe('openai');
    expect(inferProviderId('https://api.deepseek.com/v1')).toBe('deepseek');
    expect(inferProviderId('https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(inferProviderId('https://proxy.example.com/v1')).toBe('custom');
  });

  it('getProvider falls back to custom', () => {
    expect(getProvider('nope').id).toBe('custom');
  });

  it('TC-F11-U01 deepseek has no STT/TTS fields', () => {
    const ds = getProvider('deepseek');
    expect(supportsStt(ds)).toBe(false);
    expect(supportsTts(ds)).toBe(false);
    expect(supportsStt(getProvider('openai'))).toBe(true);
  });
});
