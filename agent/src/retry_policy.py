"""Parse provider retry hints without logging response bodies or credentials."""
import math
import time
from email.utils import parsedate_to_datetime

def retry_seconds(headers, default=60):
    try:
        value=headers.get('retry-after', '')
        try: seconds=float(value)
        except ValueError: seconds=parsedate_to_datetime(value).timestamp()-time.time()
        if not math.isfinite(seconds): return default
        return max(1,min(86400,seconds))
    except (ValueError,TypeError,AttributeError,OverflowError): return default
