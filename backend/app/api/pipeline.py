"""/api/pipeline — every active candidate with the stage they are in now
and how long they have been there.

Reads from the stage_current_residents derived table. Default scope is
listed_open; filters: stage, job_id, hiring_manager, source, min_days.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, Query

from app.api._common import envelope, to_records
from app.cache.registry import registry

router = APIRouter()

# Stage SLAs used to flag stuck candidates (days idle in current stage)
STAGE_SLA_DAYS = {
    "Application Review": 5,
    "Round 1": 5,
    "Round 2": 5,
    "Round 3": 5,
    "Round 4": 5,
    "Final": 7,
    "Offer": 3,
    "Hired": None,
    "Archived": None,
}

_INTERVIEW_ROUNDS = ["Round 1", "Round 2", "Round 3", "Round 4", "Final"]


@router.get("/api/pipeline")
def list_pipeline(
    stage: str | None = Query(default=None),
    job_id: str | None = Query(default=None),
    hiring_manager: str | None = Query(default=None),
    scope: str = Query(default="listed_open", pattern="^(listed_open|all)$"),
    min_days: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    df = registry.derived("stage_current_residents")
    if df is None or df.empty:
        return envelope({"residents": [], "rounds": _empty_rounds()}, last_sync_at=registry.snapshot().get("loadedAt"))

    df = df.copy()
    if scope == "listed_open":
        df = df[df["is_listed_open"]]
    if stage:
        df = df[df["stage_title"].astype(str) == stage]
    if job_id:
        df = df[df["job_id"].astype(str) == job_id]
    if hiring_manager:
        df = df[df["hiring_manager"].astype(str).str.lower() == hiring_manager.lower()]
    if min_days > 0:
        df = df[df["days_in_stage"].fillna(0) >= min_days]

    # tag whether each resident exceeds their stage SLA
    def _sla_breach(row: pd.Series) -> bool:
        sla = STAGE_SLA_DAYS.get(str(row["stage_title"]))
        if sla is None:
            return False
        try:
            return float(row["days_in_stage"]) >= sla
        except (TypeError, ValueError):
            return False

    df["sla_breach"] = df.apply(_sla_breach, axis=1)
    df = df.sort_values(["sla_breach", "days_in_stage"], ascending=[False, False])

    rounds = _rounds_summary(registry.derived("stage_current_residents"))
    return envelope(
        {"residents": to_records(df), "rounds": rounds},
        last_sync_at=registry.snapshot().get("loadedAt"),
    )


@router.get("/api/pipeline/rounds")
def pipeline_rounds() -> dict[str, Any]:
    df = registry.derived("stage_current_residents")
    return envelope(
        {"rounds": _rounds_summary(df)},
        last_sync_at=registry.snapshot().get("loadedAt"),
    )


def _empty_rounds() -> list[dict[str, Any]]:
    out = []
    for r in ["Application Review", *_INTERVIEW_ROUNDS, "Offer"]:
        out.append({
            "stage": r,
            "count": 0,
            "median_days": None,
            "p90_days": None,
            "stuck_count": 0,
            "sla_days": STAGE_SLA_DAYS.get(r),
        })
    return out


def _rounds_summary(df: pd.DataFrame | None) -> list[dict[str, Any]]:
    if df is None or df.empty:
        return _empty_rounds()
    # only listed+open applications count toward the rounds KPI
    scoped = df[df["is_listed_open"]].copy() if "is_listed_open" in df.columns else df.copy()
    out: list[dict[str, Any]] = []
    for r in ["Application Review", *_INTERVIEW_ROUNDS, "Offer"]:
        sub = scoped[scoped["stage_title"].astype(str) == r]
        sla = STAGE_SLA_DAYS.get(r)
        days = sub["days_in_stage"].dropna() if not sub.empty else pd.Series(dtype=float)
        stuck = int((days >= sla).sum()) if (sla is not None and not days.empty) else 0
        out.append({
            "stage": r,
            "count": int(len(sub)),
            "median_days": round(float(days.median()), 1) if not days.empty else None,
            "p90_days": round(float(days.quantile(0.9)), 1) if not days.empty else None,
            "stuck_count": stuck,
            "sla_days": sla,
        })
    return out
