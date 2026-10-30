import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimitStoreForTesting } from "../rateLimit";

describe("Rate Limiter (Sliding Window)", () => {
  beforeEach(() => {
    resetRateLimitStoreForTesting();
  });

  it("should allow requests under the maximum limit", () => {
    const res1 = checkRateLimit("client-1", 3, 1000);
    expect(res1.success).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = checkRateLimit("client-1", 3, 1000);
    expect(res2.success).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = checkRateLimit("client-1", 3, 1000);
    expect(res3.success).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it("should reject requests exceeding the maximum limit", () => {
    checkRateLimit("client-2", 2, 5000);
    checkRateLimit("client-2", 2, 5000);

    const blocked = checkRateLimit("client-2", 2, 5000);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetSeconds).toBeGreaterThan(0);
  });

  it("should isolate limits per client identifier", () => {
    checkRateLimit("client-a", 1, 5000);
    const blockedA = checkRateLimit("client-a", 1, 5000);
    expect(blockedA.success).toBe(false);

    const allowedB = checkRateLimit("client-b", 1, 5000);
    expect(allowedB.success).toBe(true);
  });
});
