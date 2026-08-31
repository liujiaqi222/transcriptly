import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rate-limit";

function testLimiter(overrides: { max?: number; maxKeys?: number } = {}) {
  let clock = 1_000;
  const limiter = createRateLimiter({
    windowMs: 1_000,
    max: overrides.max ?? 3,
    maxKeys: overrides.maxKeys,
    now: () => clock,
  });
  return {
    limiter,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("rate limiter", () => {
  it("allows up to max hits inside the window", () => {
    const { limiter } = testLimiter();
    expect(limiter.tryConsume("ip")).toBe(true);
    expect(limiter.tryConsume("ip")).toBe(true);
    expect(limiter.tryConsume("ip")).toBe(true);
  });

  it("blocks further hits once max is reached", () => {
    const { limiter } = testLimiter();
    for (let i = 0; i < 3; i += 1) limiter.tryConsume("ip");
    expect(limiter.tryConsume("ip")).toBe(false);
  });

  it("unblocks after the window passes", () => {
    const { limiter, advance } = testLimiter();
    for (let i = 0; i < 3; i += 1) limiter.tryConsume("ip");
    advance(1_001);
    expect(limiter.tryConsume("ip")).toBe(true);
  });

  it("tracks keys independently", () => {
    const { limiter } = testLimiter();
    for (let i = 0; i < 3; i += 1) limiter.tryConsume("a");
    expect(limiter.tryConsume("b")).toBe(true);
    expect(limiter.tryConsume("a")).toBe(false);
  });

  it("evicts the oldest key beyond the hard cap", () => {
    const { limiter } = testLimiter({ maxKeys: 3 });
    limiter.tryConsume("a");
    limiter.tryConsume("b");
    limiter.tryConsume("c");
    limiter.tryConsume("d");
    expect(limiter.tryConsume("a")).toBe(true);
  });
});
