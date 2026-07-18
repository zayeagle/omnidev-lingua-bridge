import { describe, expect, it } from 'vitest';
import { SlidingWindowLimiter } from './rate-limit';

describe('SlidingWindowLimiter (F8)', () => {
  it('TC-F8-U01 allows under limit then blocks', () => {
    let now = 1_000;
    const lim = new SlidingWindowLimiter(3, 1_000, () => now);
    expect(lim.tryConsume('t1').ok).toBe(true);
    expect(lim.tryConsume('t1').ok).toBe(true);
    expect(lim.tryConsume('t1').ok).toBe(true);
    const blocked = lim.tryConsume('t1');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/频繁/);
    now = 2_100;
    expect(lim.tryConsume('t1').ok).toBe(true);
  });
});
