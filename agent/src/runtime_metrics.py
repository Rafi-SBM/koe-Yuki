"""Low-cardinality, transcript-free metrics for internal Prometheus scraping."""
from prometheus_client import Counter, Histogram
_instance = None
class RuntimeMetrics:
    def __init__(self):
        self.turn_latency = Histogram('yuki_turn_latency_seconds', 'SDK end of user speech to worker playback start', buckets=(.25,.5,1,2,3,5,8,15,30))
        self.duration = Histogram('yuki_subsystem_duration_seconds', 'Provider operation duration', ['subsystem'], buckets=(.1,.25,.5,1,2,3,5,10,20))
        self.errors = Counter('yuki_session_errors_total', 'Unrecoverable pipeline errors')
        self.tokens = Counter('yuki_llm_tokens_total', 'Reported provider token usage', ['kind'])
def get_runtime_metrics():
    global _instance
    if _instance is None: _instance = RuntimeMetrics()
    return _instance
