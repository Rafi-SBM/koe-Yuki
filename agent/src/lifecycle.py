"""Bounded call teardown, including when LiveKit's management API is unavailable."""
import asyncio
import logging
from livekit import api

async def end_session(ctx, session, reason):
    logger = logging.getLogger('voice_agent.lifecycle')
    try:
        try:
            if session is not None: await asyncio.wait_for(session.aclose(), timeout=5)
        except Exception as error:
            logger.warning('Session close failed (%s)', type(error).__name__)
        try:
            await asyncio.wait_for(ctx.api.room.delete_room(api.DeleteRoomRequest(room=ctx.room.name)), timeout=5)
        except Exception as error:
            logger.warning('Remote room cleanup failed (%s)', type(error).__name__)
    finally:
        try:
            await asyncio.wait_for(ctx.room.disconnect(), timeout=5)
        except Exception as error:
            logger.warning('Room disconnect failed (%s)', type(error).__name__)
        finally:
            ctx.shutdown(reason=reason)
