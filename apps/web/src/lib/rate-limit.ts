/**
 * Minimal in-memory fixed-window rate limiter for anonymous endpoints
 * (#104). State lives in the process: the web app deploys as a single
 * container, so a restart resetting the window is acceptable, and no
 * Redis dependency is needed. Revisit only if the app ever scales past
 * one replica.
 *
 * Memory: nothing is freed on expiry (no timers); instead the footprint
 * is bounded three ways - stale timestamps are pruned when their key is
 * touched, expired keys are swept in bulk past `SWEEP_THRESHOLD`, and
 * FIFO eviction past `MAX_KEYS` keeps the absolute worst case (keys are
 * free to mint via a spoofed X-Forwarded-For) at roughly 100k small
 * entries.
 */
const SWEEP_THRESHOLD = 10_000;
const MAX_KEYS = 100_000;

export interface RateLimiter {
  /**
   * Records one hit for the key. Returns false once the key has reached
   * `max` hits inside the window.
   */
  tryConsume(key: string): boolean;
  /** Test helper: forget all state. */
  reset(): void;
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Eviction cap; overridable for tests. */
  maxKeys?: number;
}): RateLimiter {
  const { windowMs, max } = options;
  const maxKeys = options.maxKeys ?? MAX_KEYS;
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();
  return {
    tryConsume(key) {
      const timestamp = now();
      const recent = (hits.get(key) ?? []).filter(
        (t) => timestamp - t < windowMs,
      );
      hits.set(key, recent);
      if (recent.length >= max) return false;
      recent.push(timestamp);

      // Bulk-release keys whose hits have fully aged out.
      if (hits.size > SWEEP_THRESHOLD) {
        for (const [k, stamps] of hits) {
          if (stamps.every((t) => timestamp - t >= windowMs)) {
            hits.delete(k);
          }
        }
      }
      // Hard cap: evict the least-recently-inserted key (Map preserves
      // insertion order) so the map can never grow without limit.
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next();
        if (!oldest.done) hits.delete(oldest.value);
      }
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

/** Feedback: 10 submissions per client IP per hour. */
export const feedbackRateLimiter = createRateLimiter({
  windowMs: 3_600_000,
  max: 10,
});
