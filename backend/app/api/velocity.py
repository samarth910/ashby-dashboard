"""/api/velocity — org-wide heatmap and 90d conversion funnel."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter

from app.api._common import envelope, to_records
from app.cache.registry import registry

router = APIRouter()


def _s(df: pd.DataFrame, col: str) -> pd.Series:
    return df[col] if col in df.columns else pd.Series([None] * len(df), index=df.index)


def _ts(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce")


@router.get("/api/velocity")
def velocity() -> dict:
    apps = registry.get("applications")
    jobs = registry.get("jobs")
    now = pd.Timestamp.now(tz="UTC")
    cutoff = now - pd.Timedelta(days=90)

    # Heatmap: rows x jobs, cols x stages, cell = median days in stage (approx via updatedAt - createdAt).
    # Without application_history (v1 limitation) the heatmap is coarse — each application
    # contributes a single (current_stage, days) point.
    heatmap: list[dict] = []
    if apps is not None and not apps.empty and "job.id" in apps.columns:
        created = _ts(_s(apps, "createdAt"))
        updated = _ts(_s(apps, "updatedAt"))
        stage = _s(apps, "currentInterviewStage.title").astype(str)
        df = pd.DataFrame({
            "job_id": apps["job.id"].astype(str),
            "stage": stage,
            "days": (updated - created).dt.total_seconds() / 86400,
        }).dropna()
        df = df[df["days"] >= 0]
        grouped = df.groupby(["job_id", "stage"])["days"].median().reset_index()
        grouped.columns = ["job_id", "stage", "median_days"]
        grouped["median_days"] = grouped["median_days"].round(1)
        if jobs is not None and "title" in jobs.columns:
            jt = jobs[["id", "title"]].copy()
            jt["id"] = jt["id"].astype(str)
            grouped = grouped.merge(jt, how="left", left_on="job_id", right_on="id").drop(columns=["id"])
        heatmap = to_records(grouped)

    funnel: dict = {}
    if apps is not None and not apps.empty:
        status = _s(apps, "status").astype(str)
        stage_type = _s(apps, "currentInterviewStage.type").astype(str)
        created = _ts(_s(apps, "createdAt"))
        recent_mask = (created >= cutoff) & (created <= now)
        funnel = {
            "applied": int(recent_mask.sum()),
            "past_review": int((recent_mask & (stage_type != "PreInterviewScreen")).sum()),
            "interview": int((recent_mask & stage_type.isin(["Active", "Offer", "Hired"])).sum()),
            "offer": int((recent_mask & (stage_type == "Offer")).sum()),
            "hired": int((recent_mask & (stage_type == "Hired")).sum()),
        }

    return envelope(
        {"heatmap": heatmap, "funnel90d": funnel},
        last_sync_at=registry.snapshot().get("loadedAt"),
    )
