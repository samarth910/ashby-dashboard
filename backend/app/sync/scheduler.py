"""APScheduler wrapper: kicks incremental sync every N hours.

Lives inside the FastAPI process. Uses the refresh_service single-flight so
a cron run while a manual refresh is in flight simply no-ops (joins the
existing job)."""

from __future__ import annotations

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.sync.service import refresh_service

logger = logging.getLogger(__name__)


async def _tick() -> None:
    # async so refresh_service.start runs on the event loop (asyncio.create_task needs it)
    job = refresh_service.start(full=False)
    logger.info("scheduled refresh tick -> job %s (%s)", job.id, job.status)


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(
        _tick,
        trigger=IntervalTrigger(hours=settings.sync_interval_hours),
        id="ashby_incremental_sync",
        replace_existing=True,
        coalesce=True,
        max_instances=1,
    )
    return scheduler
