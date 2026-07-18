/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { isSkippableElement, translateViewport } from './page-translate';

describe('page-translate (F3 UNIT)', () => {
  it('TC-F3-U04 Boundary: skip input/script', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(isSkippableElement(input)).toBe(true);
    const script = document.createElement('script');
    document.body.appendChild(script);
    expect(isSkippableElement(script)).toBe(true);
  });

  it('TC-F3-U03 Err: AI fail keeps original', async () => {
    document.body.innerHTML = '<p id="t">Hello world from tests</p>';
    const p = document.getElementById('t')!;
    // Force viewport
    Object.defineProperty(p, 'getBoundingClientRect', {
      value: () => ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }),
    });
    await expect(
      translateViewport(async () => {
        throw new Error('AI fail');
      }),
    ).resolves.toMatchObject({ failed: expect.any(Number) });
    expect(p.textContent).toBe('Hello world from tests');
  });
});
