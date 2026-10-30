"""Create scoped local dotenv files from the private root configuration."""
from pathlib import Path
import secrets
import json
from dotenv import dotenv_values
root=Path(__file__).resolve().parents[1]
source=root/'.env'
if not source.exists(): raise SystemExit('Create .env from .env.example and fill in credentials first.')
values=dict(dotenv_values(source))
if not values.get('SESSION_SECRET') or values['SESSION_SECRET'].startswith('replace_'):
    values['SESSION_SECRET']=secrets.token_urlsafe(48)
frontend={'LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','LIVEKIT_AGENT_NAME','SESSION_SECRET','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','APP_ORIGIN','TRUSTED_INGRESS','YUKI_ACCESS_CODE','PUBLIC_ACCESS','ALLOW_NEW_SESSIONS','MAX_CONCURRENT_SESSIONS','MAX_SESSION_SECONDS'}
worker={'YUKI_ENV','LIVEKIT_URL','LIVEKIT_API_KEY','LIVEKIT_API_SECRET','LIVEKIT_AGENT_NAME','GROQ_API_KEYS','GROQ_API_KEY','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','MAX_CONCURRENT_SESSIONS','MAX_SESSION_SECONDS','GROQ_RPM_LIMIT','GROQ_TPM_LIMIT','DAILY_PROVIDER_REQUEST_LIMIT','GROQ_DAILY_TOKEN_LIMIT','AGENT_IDLE_PROCESSES','YUKI_SHARED_SPEECH','KOKORO_THREADS','LANGFUSE_PUBLIC_KEY','LANGFUSE_SECRET_KEY','LANGFUSE_BASE_URL','TELEMETRY_ENABLED','PROMETHEUS_PORT'}
for path,allowed in [(root/'frontend/.env.local',frontend),(root/'agent/.env',worker)]:
    # Explicit JSON quoting preserves punctuation without shell interpretation.
    path.write_text('\n'.join(f'{key}={json.dumps(value)}' for key,value in values.items() if key in allowed and value is not None)+'\n')
    path.chmod(0o600)
print('Updated scoped frontend/worker local configuration. Secret values were not printed.')
