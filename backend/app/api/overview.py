"""/api/overview — KPIs + conversion funnel + roles table (listed+open) + stuck strip.

Stage-movement chart and "days open" are deliberately omitted from this endpoint:
product decision on 2026-04-22.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter

from app.api._common import envelope, to_records
from app.cache.registry import registry

router = APIRouter()


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    return df[name] if name in df.columns else pd.Series([None] * len(df), index=df.index)


def _ts(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce")


@router.get("/api/overview")
def overview() -> dict[str, Any]:
    apps = registry.get("applications")
    offers = registry.get("offers")
    rs = registry.derived("role_summary")

    now = pd.Timestamp.now(tz="UTC")
    week_ago = now - pd.Timedelta(days=7)
    prev_week_start = now - pd.Timedelta(days=14)
    month_ago = now - pd.Timedelta(days=30)

    # only count roles that are posted AND open
    listed_open = (
        rs[rs["is_listed_open"]].copy() if rs is not None and "is_listed_open" in rs.columns else pd.DataFrame()
    )
    listed_open_ids: set[str] = set(listed_open["job_id"].astype(str)) if not listed_open.empty else set()

    # Scope every application-level view on Overview to listed+open jobs.
    # (Everything on this page is about roles currently being recruited for.)
    apps_scoped = (
        apps.loc[_col(apps, "job.id").astype(str).isin(listed_open_ids)].copy()
        if apps is not None and not apps.empty and listed_open_ids
        else pd.DataFrame()
    )

    # ----- KPIs -----
    open_roles = int(len(listed_open))

    total_live = 0
    apps_last_7 = 0
    apps_prev_7 = 0
    if not apps_scoped.empty:
        status = _col(apps_scoped, "status").astype(str)
        total_live = int((~status.isin(["Archived", "Hired"])).sum())
        if "createdAt" in apps_scoped.columns:
            created = _ts(apps_scoped["createdAt"])
            apps_last_7 = int(((created >= week_ago) & (created <= now)).sum())
            apps_prev_7 = int(((created >= prev_week_start) & (created < week_ago)).sum())

    offers_outstanding = 0
    offer_accept_rate_30d: float | None = None
    if offers is not None and not offers.empty and "status" in offers.columns:
        ostatus = offers["status"].astype(str).str.lower()
        offers_outstanding = int(ostatus.isin(["pending", "sent", "outstanding"]).sum())
        decided_col = "decidedAt" if "decidedAt" in offers.columns else (
            "updatedAt" if "updatedAt" in offers.columns else None
        )
        if decided_col:
            decided = _ts(offers[decided_col])
            recent = decided >= month_ago
            accepted = int((recent & (ostatus == "accepted")).sum())
            resolved = int((recent & ostatus.isin(["accepted", "declined", "rejected"])).sum())
            offer_accept_rate_30d = round(accepted / resolved, 3) if resolved else None

    # ----- Org conversion funnel (applied -> live -> interview -> offer -> rejected) -----
    # Scoped to applications attached to listed+open jobs.
    funnel = {"applied": 0, "live": 0, "in_interview": 0, "offer": 0, "rejected": 0}
    if not listed_open.empty:
        funnel = {
            "applied": int(listed_open["applied"].sum()),
            "live": int(listed_open["live"].sum()),
            "in_interview": int(listed_open["in_interview"].sum()),
            "offer": int(listed_open["offer"].sum()),
            "rejected": int(listed_open["rejected"].sum()),
        }

    # ----- Roles table for the home page -----
    roles_cols = ["job_id", "title", "hiring_manager", "applied", "live", "in_interview", "offer", "rejected"]
    roles_rows: list[dict[str, Any]] = []
    roles_summary = {
        "total_roles": int(len(listed_open)),
        "applied": funnel["applied"],
        "live": funnel["live"],
        "in_interview": funnel["in_interview"],
        "offer": funnel["offer"],
        "rejected": funnel["rejected"],
    }
    if not listed_open.empty:
        tbl = listed_open[roles_cols].sort_values("applied", ascending=False)
        roles_rows = to_records(tbl)

    # ----- Applications per day (stacked by source), last 30 days -----
    apps_per_day: list[dict[str, Any]] = []
    if not apps_scoped.empty and "createdAt" in apps_scoped.columns:
        created = _ts(apps_scoped["createdAt"])
        mask = (created >= month_ago) & (created <= now)
        sub = apps_scoped.loc[mask].copy()
        if not sub.empty:
            sub["_date"] = created[mask].dt.date
            source_col = "source.title" if "source.title" in sub.columns else None
            sub["_src"] = sub[source_col].astype(str) if source_col else "Unknown"
            sub = sub[~sub["_src"].isin({"Kula_Migrated", "Migrated_Kula", "Unspecified", "nan"})]
            grouped = sub.groupby(["_date", "_src"], as_index=False).size().rename(columns={"size": "count"})
            apps_per_day = [
                {"date": str(r["_date"]), "source": str(r["_src"]), "count": int(r["count"])}
                for _, r in grouped.iterrows()
            ]

    # ----- Stuck candidates: top 5 by days-since-updated, active only, listed+open only -----
    stuck: list[dict[str, Any]] = []
    if not apps_scoped.empty:
        status = _col(apps_scoped, "status").astype(str)
        active = apps_scoped.loc[~status.isin(["Archived", "Hired"])]
        if not active.empty and "updatedAt" in active.columns:
            updated = _ts(active["updatedAt"])
            days = ((now - updated).dt.total_seconds() / 86400).round().astype("Int64")
            frame = pd.DataFrame({
                "application_id": active["id"].astype(str),
                "candidate_id": _col(active, "candidate.id").astype(str),
                "candidate_name": _col(active, "candidate.name").astype(str),
                "job_id": _col(active, "job.id").astype(str),
                "job_title": _col(active, "job.title").astype(str),
                "stage": _col(active, "currentInterviewStage.title").astype(str),
                "days_since_update": days,
            })
            frame = frame.dropna(subset=["days_since_update"]).sort_values("days_since_update", ascending=False).head(5)
            stuck = to_records(frame)

    loaded_at = registry.snapshot().get("loadedAt")
    return envelope(
        {
            "kpis": {
                "openRoles": open_roles,
                "totalInPipeline": total_live,
                "applicationsLast7": apps_last_7,
                "applicationsPrev7": apps_prev_7,
                "applicationsDelta": apps_last_7 - apps_prev_7,
                "offersOutstanding": offers_outstanding,
                "offerAcceptRate30d": offer_accept_rate_30d,
            },
            "conversionFunnel": funnel,
            "rolesSummary": roles_summary,
            "roles": roles_rows,
            "applicationsPerDay30d": apps_per_day,
            "stuckCandidates": stuck,
        },
        last_sync_at=loaded_at,
    )
