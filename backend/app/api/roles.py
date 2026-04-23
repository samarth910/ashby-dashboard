"""/api/roles and /api/roles/{jobId}/... — the per-role deep dives."""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.api._common import envelope, to_records
from app.cache.registry import registry

router = APIRouter()

# Stage types exposed by Ashby that we bucket into a standard funnel
STAGE_ORDER = [
    "Application Review",
    "Round 1",
    "Round 2",
    "Round 3",
    "Round 4",
    "Final",
    "Offer",
    "Hired",
    "Archived",
]


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    return df[name] if name in df.columns else pd.Series([None] * len(df), index=df.index)


def _ts(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce")


@router.get("/api/roles")
def list_roles(
    status: str | None = Query(default=None),
    department: str | None = Query(default=None),
    hiring_manager: str | None = Query(default=None),
    scope: str = Query(default="listed_open", pattern="^(listed_open|open|all)$"),
) -> dict:
    """`scope` defaults to listed_open (posted + Open). Pass scope=all to opt out."""
    rs = registry.derived("role_summary")
    if rs is None or rs.empty:
        return envelope([], last_sync_at=registry.snapshot().get("loadedAt"))

    df = rs.copy()
    if scope == "listed_open" and "is_listed_open" in df.columns:
        df = df[df["is_listed_open"]]
    elif scope == "open" and "is_open" in df.columns:
        df = df[df["is_open"]]

    if status:
        df = df[df["status"].astype(str).str.lower() == status.lower()]
    if department and "department" in df.columns:
        df = df[df["department"].astype(str).str.lower() == department.lower()]
    if hiring_manager and "hiring_manager" in df.columns:
        df = df[df["hiring_manager"].astype(str).str.lower() == hiring_manager.lower()]

    return envelope(to_records(df), last_sync_at=registry.snapshot().get("loadedAt"))


@router.get("/api/roles/{job_id}")
def role_detail(job_id: str) -> dict:
    jobs = registry.get("jobs")
    apps = registry.get("applications")
    if jobs is None or jobs.empty:
        raise HTTPException(404, "no jobs cached yet")
    match = jobs[jobs["id"].astype(str) == job_id]
    if match.empty:
        raise HTTPException(404, f"unknown job {job_id}")

    job_row = match.iloc[0]
    role_apps = (
        apps.loc[_col(apps, "job.id").astype(str) == job_id] if apps is not None else pd.DataFrame()
    )

    meta = {
        "jobId": job_id,
        "title": str(job_row.get("title")),
        "status": str(job_row.get("status")),
        "createdAt": str(job_row.get("createdAt")),
        "openedAt": str(job_row.get("openedAt")) if pd.notna(job_row.get("openedAt")) else None,
    }

    return envelope(
        {
            "meta": meta,
            "funnel": _funnel(role_apps),
            "sources": _source_table(role_apps),
        },
        last_sync_at=registry.snapshot().get("loadedAt"),
    )


def _funnel(role_apps: pd.DataFrame) -> list[dict[str, Any]]:
    now = pd.Timestamp.now(tz="UTC")
    week_ago = now - pd.Timedelta(days=7)
    out: list[dict[str, Any]] = []

    if role_apps.empty:
        return [{"stage": s, "active_now": 0, "all_time": 0, "last_7d": 0, "median_days": None} for s in STAGE_ORDER]

    stage = _col(role_apps, "currentInterviewStage.title").astype(str)
    status = _col(role_apps, "status").astype(str)

    # "Archived" should include status == Archived OR stage == Archived
    active_now = role_apps.assign(_stage=stage.where(status != "Archived", "Archived"))
    by_stage = active_now["_stage"].value_counts().to_dict()

    created = _ts(_col(role_apps, "createdAt"))
    all_time = by_stage.copy()
    last_7 = role_apps.assign(_stage=stage.where(status != "Archived", "Archived"), _created=created)
    last_7 = last_7[last_7["_created"] >= week_ago]["_stage"].value_counts().to_dict()

    # median days in role's current stage — approximation using updatedAt - createdAt
    updated = _ts(_col(role_apps, "updatedAt"))
    role_apps = role_apps.assign(_days=(updated - created).dt.total_seconds() / 86400)
    medians = role_apps.groupby(stage)["_days"].median().to_dict()

    for s in STAGE_ORDER:
        med = medians.get(s)
        out.append({
            "stage": s,
            "active_now": int(by_stage.get(s, 0)),
            "all_time": int(all_time.get(s, 0)),
            "last_7d": int(last_7.get(s, 0)),
            "median_days": round(float(med), 1) if med is not None and pd.notna(med) else None,
        })
    return out


def _source_table(role_apps: pd.DataFrame) -> list[dict[str, Any]]:
    if role_apps.empty or "source.title" not in role_apps.columns:
        return []
    sub = role_apps.copy()
    sub["source"] = sub["source.title"].astype(str)
    sub = sub[~sub["source"].isin({"Kula_Migrated", "Migrated_Kula", "Unspecified", "nan"})]
    stage_type = _col(sub, "currentInterviewStage.type").astype(str)
    status = _col(sub, "status").astype(str)
    sub["past_review"] = (stage_type != "PreInterviewScreen").astype(int)
    sub["to_interview"] = stage_type.isin(["Active", "Offer", "Hired"]).astype(int)
    sub["offered"] = (stage_type == "Offer").astype(int)
    sub["hired"] = (stage_type == "Hired").astype(int)

    grouped = (
        sub.groupby("source")
        .agg(
            applied=("source", "size"),
            past_review=("past_review", "sum"),
            to_interview=("to_interview", "sum"),
            offered=("offered", "sum"),
            hired=("hired", "sum"),
        )
        .reset_index()
    )
    grouped["past_review_pct"] = (grouped["past_review"] / grouped["applied"]).round(3)
    return to_records(grouped.sort_values("applied", ascending=False))


@router.get("/api/roles/{job_id}/pipeline")
def role_pipeline(job_id: str) -> dict:
    apps = registry.get("applications")
    if apps is None or apps.empty:
        return envelope({}, last_sync_at=registry.snapshot().get("loadedAt"))

    role_apps = apps.loc[_col(apps, "job.id").astype(str) == job_id].copy()
    if role_apps.empty:
        return envelope({}, last_sync_at=registry.snapshot().get("loadedAt"))

    status = _col(role_apps, "status").astype(str)
    active = role_apps[~status.isin(["Archived", "Hired"])]
    stage_col = "currentInterviewStage.title"
    grouped: dict[str, list] = {}
    if stage_col in active.columns:
        for stage, g in active.groupby(stage_col):
            cols = [c for c in ["id", "candidate.id", "candidate.name", "source.title", "updatedAt"] if c in g.columns]
            grouped[str(stage)] = to_records(g[cols])
    return envelope(grouped, last_sync_at=registry.snapshot().get("loadedAt"))


@router.get("/api/roles/{job_id}/timeline")
def role_timeline(job_id: str) -> dict:
    """Per-candidate stage timelines for this role, from application_history."""
    apps = registry.get("applications")
    hist = registry.get("application_history")
    if apps is None or apps.empty or hist is None or hist.empty:
        return envelope({"candidates": []}, last_sync_at=registry.snapshot().get("loadedAt"))

    role_apps = apps.loc[_col(apps, "job.id").astype(str) == job_id]
    if role_apps.empty:
        return envelope({"candidates": []}, last_sync_at=registry.snapshot().get("loadedAt"))

    app_to_meta = {
        str(r["id"]): {
            "application_id": str(r["id"]),
            "candidate_id": str(r.get("candidate.id")),
            "candidate_name": str(r.get("candidate.name")),
            "current_stage": str(r.get("currentInterviewStage.title")),
            "status": str(r.get("status")),
        }
        for _, r in role_apps.iterrows()
    }
    app_ids = set(app_to_meta.keys())
    sub = hist[hist["application_id"].astype(str).isin(app_ids)].copy()
    if sub.empty:
        return envelope({"candidates": []}, last_sync_at=registry.snapshot().get("loadedAt"))

    sub["entered_at"] = pd.to_datetime(sub["entered_at"], utc=True, errors="coerce")
    sub["left_at"] = pd.to_datetime(sub["left_at"], utc=True, errors="coerce")
    sub = sub.sort_values(["application_id", "stage_number", "entered_at"])

    candidates = []
    for aid, group in sub.groupby("application_id"):
        meta = app_to_meta.get(str(aid), {})
        stages = []
        for _, r in group.iterrows():
            stages.append({
                "stage": str(r.get("stage_title")),
                "stage_number": int(r["stage_number"]) if pd.notna(r.get("stage_number")) else None,
                "entered_at": r["entered_at"].isoformat() if pd.notna(r["entered_at"]) else None,
                "left_at": r["left_at"].isoformat() if pd.notna(r["left_at"]) else None,
                "duration_days": round(r["duration_seconds"] / 86400, 1) if pd.notna(r.get("duration_seconds")) else None,
                "is_current": bool(r.get("is_current")),
            })
        candidates.append({**meta, "stages": stages})

    # sort: currently-active first, then by current stage number desc
    candidates.sort(key=lambda c: (c["status"] != "Active", -len(c["stages"])))
    return envelope({"candidates": candidates}, last_sync_at=registry.snapshot().get("loadedAt"))


@router.get("/api/roles/{job_id}/activity")
def role_activity(job_id: str, days: int = 7) -> dict:
    apps = registry.get("applications")
    now = pd.Timestamp.now(tz="UTC")
    cutoff = now - pd.Timedelta(days=days)
    new_apps: list[dict[str, Any]] = []
    stage_entries: list[dict[str, Any]] = []

    if apps is not None and not apps.empty:
        role = apps.loc[_col(apps, "job.id").astype(str) == job_id].copy()
        if not role.empty and "createdAt" in role.columns:
            created = _ts(role["createdAt"])
            role["_date"] = created.dt.date
            recent = role[created >= cutoff]
            if not recent.empty:
                src = "source.title" if "source.title" in recent.columns else None
                if src:
                    grp = recent.groupby(["_date", src], as_index=False).size()
                    new_apps = [
                        {"date": str(r["_date"]), "source": str(r[src]), "count": int(r["size"])}
                        for _, r in grp.iterrows()
                    ]
                stage_col = "currentInterviewStage.title" if "currentInterviewStage.title" in recent.columns else None
                if stage_col:
                    grp = recent.groupby(["_date", stage_col], as_index=False).size()
                    stage_entries = [
                        {"date": str(r["_date"]), "stage": str(r[stage_col]), "count": int(r["size"])}
                        for _, r in grp.iterrows()
                    ]

    return envelope(
        {"newApplications": new_apps, "stageEntries": stage_entries},
        last_sync_at=registry.snapshot().get("loadedAt"),
    )
