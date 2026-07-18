import { describe, expect, it } from 'vitest';
import {
  encodeQueryPlus,
  hmacSha256Base64,
  mapIflytekAuthError,
  sanitizeIflytekToken,
  wsSignatureOrigin,
} from './auth';

describe('iflytek auth (F22 UNIT)', () => {
  it('builds WS signature origin with request-line', () => {
    const origin = wsSignatureOrigin(
      'iat.cn-huabei-1.xf-yun.com',
      'Wed, 10 Jul 2019 07:35:43 GMT',
      '/v1',
    );
    expect(origin).toBe(
      'host: iat.cn-huabei-1.xf-yun.com\ndate: Wed, 10 Jul 2019 07:35:43 GMT\nGET /v1 HTTP/1.1',
    );
  });

  it('HMAC-SHA256 base64 is stable for fixture', async () => {
    const sig = await hmacSha256Base64('secret', 'payload');
    expect(sig).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(sig.length).toBeGreaterThan(20);
    expect(await hmacSha256Base64('secret', 'payload')).toBe(sig);
  });

  it('encodeQueryPlus uses + for spaces like Python urlencode', () => {
    const q = encodeQueryPlus({
      date: 'Mon, 13 Dec 2021 03:37:23 GMT',
      serviceId: 'simult_interpretation',
    });
    expect(q).toContain('Mon%2C+13+Dec');
    expect(q).toContain('serviceId=simult_interpretation');
  });

  it('maps HMAC mismatch to Chinese hint', () => {
    expect(mapIflytekAuthError('HMAC signature does not match')).toMatch(/鉴权失败/);
    expect(mapIflytekAuthError('HMAC signature does not match', 'stt')).toMatch(/听写/);
    expect(mapIflytekAuthError('HMAC signature does not match', 'simult')).toMatch(
      /同声传译/,
    );
  });

  it('sanitizes pasted console tokens', () => {
    expect(sanitizeIflytekToken(' 4412 6acf \u200b23cf ')).toBe('44126acf23cf');
  });
});
