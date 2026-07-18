/** Simple sliding-window rate limiter (UNIT-testable). */

export type RateLimitResult = { ok: true } | { ok: false; error: string };

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  tryConsume(key: string): RateLimitResult {
    const t = this.now();
    const cutoff = t - this.windowMs;
    const prev = this.hits.get(key) ?? [];
    const recent = prev.filter((ts) => ts > cutoff);
    if (recent.length >= this.maxHits) {
      this.hits.set(key, recent);
      return { ok: false, error: '请求过于频繁，请稍后重试' };
    }
    recent.push(t);
    this.hits.set(key, recent);
    return { ok: true };
  }
}

/** Default: 40 AI requests / minute per tab (or global). */
export function createAiRateLimiter(): SlidingWindowLimiter {
  return new SlidingWindowLimiter(40, 60_000);
}
