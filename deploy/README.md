# Deployment

The code and packaging are prepared locally; this guide does not deploy them.
Run the checks in README and review docs/REMEDIATION_REPORT.md before release.

## Required configuration

Use a dedicated Upstash Redis REST database (or an authenticated compatible HTTPS
Redis REST endpoint) for this environment. Both services need its URL and write
token. Admission, model quotas, daily budgets, credential cooldowns, and worker
heartbeats use atomic Lua operations in the same Redis hash slot. A read-only token
will not work. Store/heartbeat failures fail admission closed. A lost worker stops
being ready after its 20-second heartbeat TTL.

The frontend requires:

- LIVEKIT_URL (wss), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
- SESSION_SECRET: at least 32 random bytes, shared by every frontend replica.
- APP_ORIGIN: the exact public HTTPS origin, without a trailing slash.
- TRUSTED_INGRESS: vercel on Vercel, or cloudflare behind a Cloudflare-only origin.
- UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
- YUKI_ACCESS_CODE for a restricted beta; explicitly PUBLIC_ACCESS=true for public traffic.
- MAX_CONCURRENT_SESSIONS, MAX_SESSION_SECONDS, and ALLOW_NEW_SESSIONS.

The worker needs LiveKit/Groq credentials, the same Redis write connection, and
YUKI_ENV=production. Set GROQ_RPM_LIMIT, GROQ_TPM_LIMIT,
DAILY_PROVIDER_REQUEST_LIMIT, and GROQ_DAILY_TOKEN_LIMIT below your actual
organization allocation. Estimated tokens deliberately reserve a conservative
upper bound. Quota controls apply to this application; account billing controls
are still required. Completed metered responses refund unused token reservations;
interrupted or unmetered requests retain the reservation to bound cost. Account limits
must also cover any other applications sharing the organization.

Keep worker-only Groq and Langfuse credentials off the frontend. TELEMETRY_ENABLED
is false by default. Enable it only after retention/access settings are approved.
Do not expose port 9090 metrics or the worker management plane publicly.

[Vercel documents its immutable forwarded client header](https://vercel.com/docs/headers/request-headers).
For Cloudflare, restrict direct origin access and ensure CF-Connecting-IP is replaced
by that ingress. The application intentionally ignores arbitrary X-Forwarded-For.
[Redis REST authentication and command semantics](https://upstash.com/docs/redis/features/restapi)
use HTTPS with a bearer write token.

## Docker

```sh
docker build -t yuki-frontend:release frontend
docker build -t yuki-agent:release agent
docker compose config --quiet
# After configuring production variables, HTTPS ingress and access policy:
docker compose up -d
```

Compose binds the frontend to 127.0.0.1:3000 for a reverse proxy. It does not
configure TLS or a Cloudflare account. It does not inherit the entire .env in
either container. Model files are downloaded atomically, SHA-256 verified, and
embedded during the agent build; startup fails if their hashes/runtime are invalid.
No bind mount hides the image's model assets. Silero assets are downloaded during
build. Both application containers run without root privileges.

Start with restricted access and one global session. Raise this only after load gates pass. The supplied 2 CPU /
4 GiB worker allocation is a starting configuration, not certified capacity.
Benchmark and soak on the actual architecture/region before changing limits.
Keep frontend and worker releases compatible with yuki.control.v1 and deadline/
consent metadata. Direct token clients must supply this metadata too.

## Vercel frontend

Set the project root to frontend and use Node 24. Build with npm run build.
Configure only the frontend variables listed above as server environment values;
none of the signing credentials use NEXT_PUBLIC_. Configure APP_ORIGIN separately
for each preview/staging/production deployment. Use a dedicated staging Redis
namespace/database and LiveKit project to avoid consuming production capacity.
The localhost diagnostics endpoint is intentionally unavailable in production.

## Hugging Face worker

Run scripts/package-space.sh. The resulting .local/huggingface-space directory is
a complete Space root containing Dockerfile, README YAML, pinned requirements,
source, knowledge, and the model downloader. Upload that directory explicitly;
this script does not upload anything. The Space uses Docker and app_port 8081.
Set the worker variables as Space secrets. Sleeping development compute cannot
support an always-on launch: choose appropriate persistent hardware and run the
strict voice/load gates on that hardware. Keep metrics internal.

## Release sequence

1. Pass clean installation, offline regressions, dependency scans and container builds.
2. Provision HTTPS ingress/shared controls and test missing/expired heartbeats, capacity,
   private access, cross-session denial, and quota exhaustion in staging.
3. Test real speech, interruption, mute/reconnect/device switching on desktop Chrome,
   Safari and physical iOS/Android devices. Confirm provider retention and native
   pronunciation with representative speakers for each enabled language.
4. Run repeated concurrent conversations and a soak at the chosen admission limit;
   record startup, first-audio latency, failures, CPU and memory. One two-call pass
   is not an availability or p95 certification.
5. Configure an owner, readiness/synthetic/error/usage alerts, rollback image tags,
   and provider billing caps. Open restricted beta before public traffic.
