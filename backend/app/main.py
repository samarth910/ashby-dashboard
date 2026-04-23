from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import health, overview, people, pipeline, refresh, roles, sources, velocity
from app.cache.registry import registry
from app.config import REPO_ROOT, settings
from app.security import IPAllowlistMiddleware
from app.sync.scheduler import build_scheduler
from app.sync.service import refresh_service

logger = logging.getLogger(__name__)

_FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(
        level=settings.app_log_level.upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # load whatever's on disk. Empty on a fresh install; populated after seed.
    try:
        registry.reload_from_disk()
    except Exception:
        logger.exception("initial registry load failed; serving empty")

    scheduler = build_scheduler()
    scheduler.start()
    logger.info("scheduler started: incremental every %sh", settings.sync_interval_hours)
    app.state.scheduler = scheduler

    # self-seed on first boot: if the volume is empty, kick off a full sync now
    # so a brand-new deploy doesn't sit idle until the 6h cron fires.
    snap = registry.snapshot()
    total_rows = sum(snap.get("entities", {}).values())
    if total_rows == 0:
        logger.info("registry empty on startup; kicking off initial full sync")
        refresh_service.start(full=True)

    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    app = FastAPI(title="Sarvam Hiring Dashboard", version="0.1.0", lifespan=lifespan)
    app.add_middleware(IPAllowlistMiddleware)
    app.include_router(health.router)
    app.include_router(refresh.router)
    app.include_router(overview.router)
    app.include_router(roles.router)
    app.include_router(velocity.router)
    app.include_router(sources.router)
    app.include_router(people.router)
    app.include_router(pipeline.router)

    # serve the built frontend (if present). In dev, Vite runs on :5173 and
    # proxies /api -> this server; this mount is only used in prod / Railway.
    if _FRONTEND_DIST.is_dir():
        _mount_frontend(app)
    return app


def _mount_frontend(app: FastAPI) -> None:
    assets_dir = _FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/favicon.svg")
    def _favicon() -> FileResponse:
        return FileResponse(_FRONTEND_DIST / "favicon.svg")

    @app.get("/manifest.webmanifest")
    def _manifest() -> FileResponse:
        return FileResponse(_FRONTEND_DIST / "manifest.webmanifest")

    @app.get("/{full_path:path}")
    def _spa(full_path: str, request: Request) -> FileResponse:
        # any non-API path falls back to index.html for client-side routing
        if full_path.startswith("api/"):
            # this should be handled by explicit routers above; defend anyway
            raise RuntimeError("api route missed by router")
        return FileResponse(_FRONTEND_DIST / "index.html")


app = create_app()
