"""/api/people — hiring manager / recruiter load."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter

from app.api._common import envelope, to_records
from app.cache.registry import registry

router = APIRouter()


@router.get("/api/people")
def people_load() -> dict:
    users = registry.get("users")
    rs = registry.derived("role_summary")
    if users is None or rs is None or users.empty or rs.empty:
        return envelope([], last_sync_at=registry.snapshot().get("loadedAt"))

    # scope to listed+open so "active roles" means roles actually being recruited for
    scoped = rs[rs["is_listed_open"]] if "is_listed_open" in rs.columns else rs
    grouped = scoped.groupby("hiring_manager", dropna=False).agg(
        active_roles=("job_id", "count"),
        live=("live", "sum"),
        in_interview=("in_interview", "sum"),
        offer=("offer", "sum"),
    ).reset_index()
    grouped = grouped[grouped["hiring_manager"].notna()]
    return envelope(to_records(grouped), last_sync_at=registry.snapshot().get("loadedAt"))
