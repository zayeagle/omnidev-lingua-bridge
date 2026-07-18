import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IFLYTEK_MT,
  DEFAULT_IFLYTEK_STT,
  DEFAULT_IFLYTEK_TTS,
  getIflytekSttProduct,
  getIflytekTtsProduct,
  normalizeIflytekMtProduct,
  normalizeIflytekSttProduct,
  normalizeIflytekTtsProduct,
} from './products';

describe('iflytek products', () => {
  it('defaults to current composed combo', () => {
    expect(normalizeIflytekSttProduct(undefined)).toBe(DEFAULT_IFLYTEK_STT);
    expect(normalizeIflytekMtProduct(undefined)).toBe(DEFAULT_IFLYTEK_MT);
    expect(normalizeIflytekTtsProduct(undefined)).toBe(DEFAULT_IFLYTEK_TTS);
    expect(DEFAULT_IFLYTEK_STT).toBe('mul_cn');
    expect(DEFAULT_IFLYTEK_MT).toBe('its');
    expect(DEFAULT_IFLYTEK_TTS).toBe('oral');
  });

  it('normalizes known STT / TTS ids', () => {
    expect(normalizeIflytekSttProduct('dialect')).toBe('dialect');
    expect(normalizeIflytekSttProduct('iat_en')).toBe('iat_en');
    expect(normalizeIflytekSttProduct('iat')).toBe('iat');
    expect(normalizeIflytekSttProduct('nope')).toBe('mul_cn');
    expect(normalizeIflytekTtsProduct('online_x2_john')).toBe('online_x2_john');
    expect(getIflytekSttProduct('iat').protocol).toBe('iat_v2');
    expect(getIflytekTtsProduct('online').protocol).toBe('online_v2');
  });

  it('maps legacy model labels and supports its_v2 / niutrans', () => {
    expect(normalizeIflytekMtProduct('iflytek-mt')).toBe('its');
    expect(normalizeIflytekMtProduct('its_v2')).toBe('its_v2');
    expect(normalizeIflytekMtProduct('niutrans')).toBe('niutrans');
    expect(normalizeIflytekSttProduct('simult')).toBe('mul_cn');
  });
});
