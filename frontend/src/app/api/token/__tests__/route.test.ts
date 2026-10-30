// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";
import { POST as endSession } from "../../session/end/route";
import { COOKIE_NAME, clientKey, configurationErrors, leaseTicket, releaseLease, sessionId, verifyLeaseTicket } from "@/lib/serverPolicy";
import { resetRateLimitStoreForTesting } from "@/lib/rateLimit";
import * as policy from "@/lib/serverPolicy";
const cloud = vi.hoisted(() => ({ dispatch: vi.fn(), deleteRoom: vi.fn() }));
vi.mock("livekit-server-sdk", async importOriginal => {
  const original = await importOriginal<typeof import("livekit-server-sdk")>();
  return { ...original, RoomServiceClient: class { deleteRoom = cloud.deleteRoom; }, AgentDispatchClient: class { createDispatch = cloud.dispatch; } };
});
const active: { id: string; room: string }[] = [];
const origin = "http://localhost:3000";
function request(body: unknown = { consent: true }, cookie?: string, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/token`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: JSON.stringify(body) });
}
async function join() {
  const response = await POST(request());
  const data = await response.json();
  const cookie = `${COOKIE_NAME}=${response.cookies.get(COOKIE_NAME)?.value}`;
  const id = sessionId(request({}, cookie))!;
  if (response.ok) active.push({ id, room: data.roomName });
  return { response, data, cookie, id };
}
beforeEach(() => {
  vi.stubEnv("LIVEKIT_AGENT_NAME", "");
  cloud.dispatch.mockReset().mockResolvedValue({ id: "dispatch" });
  cloud.deleteRoom.mockReset().mockResolvedValue(undefined);
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("LIVEKIT_URL", "wss://test.livekit.cloud"); vi.stubEnv("LIVEKIT_API_KEY", "test-api-key"); vi.stubEnv("LIVEKIT_API_SECRET", "a".repeat(40)); vi.stubEnv("SESSION_SECRET", "b".repeat(40)); vi.stubEnv("UPSTASH_REDIS_REST_URL", ""); vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", ""); vi.stubEnv("YUKI_ACCESS_CODE", ""); vi.stubEnv("APP_ORIGIN", ""); vi.stubEnv("TRUSTED_INGRESS", ""); vi.stubEnv("MAX_CONCURRENT_SESSIONS", "2"); resetRateLimitStoreForTesting();
});
afterEach(async () => { for (const session of active.splice(0)) await releaseLease(session.id, session.room); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("session security", () => {
  it("starts a named cloud worker without a warm heartbeat after enforcing consent and capacity", async () => {
    vi.stubEnv("LIVEKIT_AGENT_NAME", "yuki");
    vi.spyOn(policy, "workerReady").mockResolvedValue(false);
    expect((await POST(request({ consent: false }))).status).toBe(400);
    expect(cloud.dispatch).not.toHaveBeenCalled();
    const first = await join();
    expect(first.response.status).toBe(200);
    expect(first.data.startupTimeoutMs).toBe(90000);
    expect(cloud.dispatch).toHaveBeenCalledWith(first.data.roomName, "yuki");
    expect((await POST(request({ consent: true }, first.cookie))).status).toBe(429);
    expect(cloud.dispatch).toHaveBeenCalledTimes(1);
  });
  it("removes the room and frees capacity when cloud dispatch fails", async () => {
    vi.stubEnv("LIVEKIT_AGENT_NAME", "yuki");
    vi.stubEnv("MAX_CONCURRENT_SESSIONS", "1");
    cloud.dispatch.mockRejectedValueOnce(new Error("Cloud unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(cloud.deleteRoom).toHaveBeenCalledTimes(1);
    expect((await join()).response.status).toBe(200);
  });
  it("keeps self-hosted admission closed without a ready worker", async () => {
    vi.spyOn(policy, "workerReady").mockResolvedValue(false);
    expect((await POST(request())).status).toBe(503);
    expect(cloud.dispatch).not.toHaveBeenCalled();
  });
  it("refuses GET, foreign origins, missing consent and caller-owned identifiers", async () => {
    expect((await GET()).status).toBe(405);
    expect((await POST(request({}, undefined, { Origin: "https://attacker.example" }))).status).toBe(403);
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ consent: true, room: "another-user-room" }))).status).toBe(400);
  });
  it("signs a private owner cookie and only microphone grants for a generated room", async () => {
    const { response, data, id } = await join();
    expect(response.status).toBe(200); expect(id).toBeTruthy();
    const jwt = JSON.parse(Buffer.from(data.token.split(".")[1], "base64url").toString());
    expect(jwt.video.room).toBe(data.roomName); expect(jwt.video.canPublishSources).toEqual(["microphone"]);
    expect(jwt.sub).toBe(data.participantName); expect(jwt.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(120);
    expect(JSON.parse(jwt.metadata)).toMatchObject({ consent: true, protocol: "yuki.control.v1" });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly"); expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  });
  it("enforces one active call per signed owner and a global capacity cap", async () => {
    const first = await join(); expect((await POST(request({ consent: true }, first.cookie))).status).toBe(429);
    const second = await join(); expect(second.response.status).toBe(200);
    expect(first.data.roomName).not.toBe(second.data.roomName); expect((await POST(request())).status).toBe(429);
  });
  it("defaults to one global call until capacity has been configured", async () => {
    vi.stubEnv("MAX_CONCURRENT_SESSIONS", "");
    expect((await join()).response.status).toBe(200);
    expect((await join()).response.status).toBe(429);
  });
  it("rejects forged and cross-owner cleanup tickets", async () => {
    const owner = await join(), stranger = await join();
    expect(verifyLeaseTicket(owner.data.lease, stranger.id)).toBeNull();
    expect(verifyLeaseTicket(leaseTicket(owner.id, owner.data.roomName, Date.now() + 30000) + "x", owner.id)).toBeNull();
    expect((await endSession(request({ lease: owner.data.lease }, stranger.cookie))).status).toBe(403);
    expect((await endSession(request({ lease: owner.data.lease }, owner.cookie))).status).toBe(200);
    const restarted = await POST(request({ consent: true }, owner.cookie));
    expect(restarted.status).toBe(200);
    active.push({ id: owner.id, room: (await restarted.json()).roomName });
    await releaseLease(owner.id, owner.data.roomName);
  });
  it("ignores arbitrary forwarded IP headers, requires access codes and bounds actual body size", async () => {
    expect(clientKey(request({}, undefined, { "x-forwarded-for": "one" }))).toBe(clientKey(request({}, undefined, { "x-forwarded-for": "two" })));
    vi.stubEnv("YUKI_ACCESS_CODE", "private-test-code");
    expect((await POST(request())).status).toBe(403);
    expect((await POST(request({ consent: true, accessCode: "x".repeat(2000) }))).status).toBe(400);
  });
  it("fails closed in production without shared limits, ingress and access policy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(configurationErrors()).toEqual(expect.arrayContaining(["shared_limits", "origin", "trusted_ingress", "access_policy"]));
    expect((await POST(request())).status).toBe(503);
  });
});
