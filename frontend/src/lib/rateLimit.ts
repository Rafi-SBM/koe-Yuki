/**
 * In-memory sliding-window rate limiter for server endpoints.
 * Complies with RATE-01, RATE-03, RATE-06, RATE-08, RATE-12.
 */

import { randomUUID } from "node:crypto";
import { production, redis, redisConfigured } from "./serverPolicy";

interface RateLimitRecord {
  timestamps: number[];
}

const store = new Map<string, RateLimitRecord>();

// Cleanup stale records periodically every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function purgeStale(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, record] of store.entries()) {
    const valid = record.timestamps.filter((ts) => now - ts < windowMs);
    if (valid.length === 0) {
      store.delete(key);
    } else {
      record.timestamps = valid;
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 30,
  windowMs: number = 60 * 1000
): RateLimitResult {
  purgeStale(windowMs);

  const now = Date.now();
  let record = store.get(identifier);
  if (!record) {
    record = { timestamps: [] };
    store.set(identifier, record);
  }

  // Filter out timestamps outside window
  record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

  if (record.timestamps.length >= maxRequests) {
    const oldest = record.timestamps[0];
    const resetSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return {
      success: false,
      limit: maxRequests,
      remaining: 0,
      resetSeconds: Math.max(1, resetSeconds),
    };
  }

  record.timestamps.push(now);
  const remaining = Math.max(0, maxRequests - record.timestamps.length);
  const oldest = record.timestamps[0];
  const resetSeconds = Math.ceil((oldest + windowMs - now) / 1000);

  return {
    success: true,
    limit: maxRequests,
    remaining,
    resetSeconds: Math.max(1, resetSeconds),
  };
}

export function resetRateLimitStoreForTesting() {
  store.clear();
}

export async function checkSharedRateLimit(identifier: string, maxRequests = 10, windowMs = 60000): Promise<RateLimitResult> {
  if (!redisConfigured()) {
    if (production()) throw new Error("Shared rate limiting unavailable");
    return checkRateLimit(identifier, maxRequests, windowMs);
  }
  const now = Date.now();
  const lua = "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]-ARGV[2]); local n=redis.call('ZCARD',KEYS[1]); local ok=0; if n<tonumber(ARGV[3]) then redis.call('ZADD',KEYS[1],ARGV[1],ARGV[4]); n=n+1; ok=1 end; redis.call('PEXPIRE',KEYS[1],ARGV[2]); local first=redis.call('ZRANGE',KEYS[1],0,0,'WITHSCORES'); return {ok,n,first[2] or ARGV[1]}";
  const [ok, count, first] = await redis(["EVAL", lua, 1, `{yuki}:limit:${identifier}`, now, windowMs, maxRequests, randomUUID()]);
  return { success: ok === 1, limit: maxRequests, remaining: Math.max(0, maxRequests - Number(count)), resetSeconds: Math.max(1, Math.ceil((Number(first) + windowMs - now) / 1000)) };
}
