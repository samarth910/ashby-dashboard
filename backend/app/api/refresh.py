"""Refresh endpoints. POST starts a run (single-flight), GET polls progress."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.sync.service import refresh_service

router = APIRouter()


@router.post("/api/refresh")
async def post_refresh(full: bool = False) -> dict:
    # async so refresh_service.start can asyncio.create_task on the running loop
    job = refresh_service.start(full=full)
    return {"jobId": job.id, "status": job.status, "kind": job.kind}


@router.get("/api/refresh/{job_id}")
async def get_refresh(job_id: str) -> dict:
    job = refresh_service.get(job_id)
    if job is None:
        raise HTTPException(404, f"unknown job id {job_id}")
    return job.to_dict()


@router.get("/api/refresh")
async def get_current_refresh() -> dict:
    current = refresh_service.current_job
    if current is None:
        return {"status": "idle"}
    return current.to_dict()
