import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const COOKIE_NAME = "yuki-session";
const UUID = /^[0-9a-f-]{36}$/;
export const production = () => process.env.NODE_ENV === "production";
export const redisConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
export const maxSessionSeconds = () => Math.max(60, Math.min(900, Number(process.env.MAX_SESSION_SECONDS) || 300));
function secret() {
  const value = process.env.SESSION_SECRET || (!production() ? process.env.LIVEKIT_API_SECRET : "");
  if (!value || value.length < 32) throw new Error("Session signing is unavailable");
  return value;
}
function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }
export function equalSecret(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function sessionId(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value || "";
  if (cookie.length > 200) return null;
  const [id, signature, extra] = cookie.split(".");
  return id && UUID.test(id) && signature && !extra && equalSecret(sign(id), signature) ? id : null;
}
export function newSession() { const id = randomUUID(); return { id, cookie: `${id}.${sign(id)}` }; }
export function sessionCookie(id: string) { return `${id}.${sign(id)}`; }
export function sameOrigin(request: NextRequest) {
  return request.headers.get("origin") === (process.env.APP_ORIGIN || new URL(request.url).origin)
    && request.headers.get("sec-fetch-site") !== "cross-site";
}
export function clientKey(request: NextRequest) {
  const header = process.env.TRUSTED_INGRESS === "vercel" ? "x-vercel-forwarded-for"
    : process.env.TRUSTED_INGRESS === "cloudflare" ? "cf-connecting-ip" : null;
  return sign(header ? request.headers.get(header)?.split(",")[0]?.trim() || "unknown" : "local");
}
export function configurationErrors() {
  const errors: string[] = [];
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !/^wss:\/\//.test(process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || "")) errors.push("livekit");
  if (process.env.ALLOW_NEW_SESSIONS === "false") errors.push("maintenance");
  if (production()) {
    if ((process.env.SESSION_SECRET || "").length < 32) errors.push("session_signing");
    if (!redisConfigured()) errors.push("shared_limits");
    if (!/^https:\/\//.test(process.env.APP_ORIGIN || "")) errors.push("origin");
    if (!["vercel", "cloudflare"].includes(process.env.TRUSTED_INGRESS || "")) errors.push("trusted_ingress");
    if (!process.env.YUKI_ACCESS_CODE && process.env.PUBLIC_ACCESS !== "true") errors.push("access_policy");
  }
  return errors;
}
export async function boundedBody(request: NextRequest, limit = 1024) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Expected JSON");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Expected object");
    return data as Record<string, unknown>;
  } finally { reader.releaseLock(); }
}
export async function redis(command: (string | number)[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  if (!url.startsWith("https://")) throw new Error("Shared store requires HTTPS");
  const result = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(command), cache: "no-store", signal: AbortSignal.timeout(3000) });
  if (!result.ok) throw new Error("Shared store unavailable");
  const payload = await result.json();
  if (payload.error) throw new Error("Shared store command failed");
  return payload.result;
}
const localLeases = new Map<string, { room: string; expires: number }>();
export async function acquireLease(id: string, room: string, expires: number) {
  const now = Date.now(); const max = Math.max(1, Math.min(20, Number(process.env.MAX_CONCURRENT_SESSIONS) || 1));
  if (redisConfigured()) {
    const lua = "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); if redis.call('EXISTS',KEYS[2])==1 or redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[4]) then return 0 end; redis.call('SET',KEYS[2],ARGV[2],'PX',tonumber(ARGV[3])-tonumber(ARGV[1])); redis.call('ZADD',KEYS[1],ARGV[3],ARGV[2]); return 1";
    return await redis(["EVAL", lua, 2, "{yuki}:sessions", `{yuki}:session:${id}`, now, room, expires, max]) === 1;
  }
  if (production()) throw new Error("Shared admission is unavailable");
  for (const [key, lease] of localLeases) if (lease.expires <= now) localLeases.delete(key);
  if (localLeases.has(id) || localLeases.size >= max) return false;
  localLeases.set(id, { room, expires }); return true;
}
export async function releaseLease(id: string, room: string) {
  if (redisConfigured()) {
    await redis(["EVAL", "if redis.call('GET',KEYS[2])==ARGV[1] then redis.call('DEL',KEYS[2]); redis.call('ZREM',KEYS[1],ARGV[1]); return 1 end; return 0", 2, "{yuki}:sessions", `{yuki}:session:${id}`, room]);
  } else if (localLeases.get(id)?.room === room) localLeases.delete(id);
}
export function leaseTicket(id: string, room: string, expires: number) { const value = `${id}:${room}:${expires}`; return `${value}.${sign(value)}`; }
export function verifyLeaseTicket(ticket: unknown, id: string) {
  if (typeof ticket !== "string" || ticket.length > 300) return null;
  const [value, signature, extra] = ticket.split(".");
  if (!value || !signature || extra || !equalSecret(sign(value), signature)) return null;
  const [owner, room, expires] = value.split(":");
  return owner === id && /^yuki-[0-9a-f-]{36}$/.test(room) && Number(expires) + 60000 > Date.now() ? room : null;
}
export async function workerReady() {
  if (!redisConfigured()) return !production();
  const rows = await redis(["EVAL", "redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',ARGV[1]); local ids=redis.call('ZRANGE',KEYS[1],0,-1); local out={}; for _,id in ipairs(ids) do local v=redis.call('GET',id); if v then table.insert(out,v) end end; return out", 1, "{yuki}:workers", Date.now()]);
  return Array.isArray(rows) && rows.some((row: string) => { const state = JSON.parse(row); return state.ready === true && state.accepting === true; });
}
