"""RefreshService: single-flight orchestration of sync runs for the HTTP API.

- Concurrency: if a run is in flight, return its job id instead of starting a second one.
- Progress: each entity's state is updated as run_sync fires events.
- History: we retain the last N completed jobs so polling clients can finish watching.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.ashby.entities import ENTITIES
from app.cache.registry import registry
from app.sync.runner import run_sync

logger = logging.getLogger(__name__)

MAX_HISTORY = 50


@dataclass
class EntityProgress:
    state: str = "pending"     # pending | running | success | failed
    count: int = 0
    fetched: int = 0
    duration_sec: float | None = None
    error: str | None = None


@dataclass
class RefreshJob:
    id: str
    kind: str                  # "full" | "incremental"
    status: str = "running"    # running | success | partial | failed
    started_at: str = ""
    completed_at: str | None = None
    duration_sec: float | None = None
    error: str | None = None
    entities: dict[str, EntityProgress] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        total = len(self.entities) or 1
        done = sum(1 for e in self.entities.values() if e.state in ("success", "failed"))
        d["progress"] = round(done / total, 3)
        return d


class RefreshService:
    def __init__(self) -> None:
        self._run_lock = asyncio.Lock()
        self._current: RefreshJob | None = None
        self._history: dict[str, RefreshJob] = {}
        self._order: list[str] = []
        self._tasks: set[asyncio.Task[Any]] = set()

    @property
    def current_job(self) -> RefreshJob | None:
        return self._current

    def get(self, job_id: str) -> RefreshJob | None:
        return self._history.get(job_id)

    def start(self, *, full: bool = False) -> RefreshJob:
        """Return the in-flight job if any, else kick off a new one."""
        if self._current and self._current.status == "running":
            return self._current
        job = RefreshJob(
            id=uuid.uuid4().hex[:12],
            kind="full" if full else "incremental",
            started_at=_now_iso(),
        )
        for e in ENTITIES:
            job.entities[e.name] = EntityProgress()
        self._current = job
        self._history[job.id] = job
        self._order.append(job.id)
        while len(self._order) > MAX_HISTORY:
            drop = self._order.pop(0)
            self._history.pop(drop, None)

        task = asyncio.create_task(self._run(job, full=full))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return job

    async def _run(self, job: RefreshJob, *, full: bool) -> None:
        def on_event(name: str, event: str, payload: dict[str, Any]) -> None:
            entry = job.entities.get(name)
            if entry is None:
                return
            if event == "started":
                entry.state = "running"
            elif event == "completed":
                entry.state = "failed" if payload.get("lastError") else "success"
                entry.count = int(payload.get("rowCount", 0))
                entry.fetched = int(payload.get("fetchedThisRun", 0))
                entry.duration_sec = payload.get("durationSec")
                entry.error = payload.get("lastError")
            elif event == "failed":
                entry.state = "failed"
                entry.error = payload.get("error")

        try:
            async with self._run_lock:
                t0 = _now_ts()
                await run_sync(full=full, on_entity_event=on_event)
                job.duration_sec = round(_now_ts() - t0, 2)
                # swap live DataFrames so API endpoints see fresh data
                try:
                    registry.reload_from_disk()
                except Exception:
                    logger.exception("registry reload after sync failed")
            any_err = any(e.error for e in job.entities.values())
            job.status = "partial" if any_err else "success"
        except Exception as exc:  # pragma: no cover - surfaces to /api/health
            logger.exception("refresh %s crashed", job.id)
            job.status = "failed"
            job.error = f"{type(exc).__name__}: {exc}"
        finally:
            job.completed_at = _now_iso()
            if self._current is job:
                self._current = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_ts() -> float:
    import time
    return time.perf_counter()


refresh_service = RefreshService()
