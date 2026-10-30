"""One real conversation, semantic/audio assertions, settings ACK, and teardown."""
import asyncio
from test_concurrency import main
if __name__ == '__main__':
    raise SystemExit(asyncio.run(main(1, 30, 5000)))
