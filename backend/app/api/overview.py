"""/api/overview — Home page payload.

Six headline KPIs, dept-grouped roles each with the same metrics, weekly
applications-by-source trend, and a stuck-candidate callout with per-stage
SLA breach detection from stage_current_residents.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter

from app.api._common import envelope, to_records
from app.api.funnel import _team_for_job
from app.api.pipeline import STAGE_SLA_DAYS
from app.cache.registry import registry

router = APIRouter()


def _col(df: pd.DataFrame, name: str) -> pd.Series:
    return df[name] if name in df.columns else pd.Series([None] * len(df), index=df.index)


def _ts(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce")


@router.get("/api/overview")
def overview() -> dict[str, Any]:
    apps = registry.get("applications")
    rs = registry.derived("role_summary")
    residents = registry.derived("stage_current_residents")
    job_postings = registry.get("job_postings")

    listed_open = rs[rs["is_listed_open"]].copy() if (rs is not None and "is_listed_open" in rs.columns) else pd.DataFrame()
    listed_open_ids: set[str] = set(listed_open["job_id"].astype(str)) if not listed_open.empty else set()

    apps_scoped = (
        apps.loc[_col(apps, "job.id").astype(str).isin(listed_open_ids)].copy()
        if apps is not None and not apps.empty and listed_open_ids
        else pd.DataFrame()
    )

    # ---- Six headline KPIs ----
    applicants = int(len(apps_scoped))
    in_review = 0
    in_interview = 0
    rejected = 0
    if not apps_scoped.empty:
        stype = _col(apps_scoped, "currentInterviewStage.type").astype(str)
        status = _col(apps_scoped, "status").astype(str)
        in_review = int((stype == "PreInterviewScreen").sum())
        in_interview = int((stype == "Active").sum())
        rejected = int((status == "Archived").sum())

    # Conversion = past-review rate. Hired/offered too low at this stage to be a useful headline.
    conversion_pct: float | None = None
    if applicants > 0:
        past_review = applicants - in_review - rejected
        conversion_pct = round(past_review / applicants, 4)

    # Fill rate: TBD per request — hired-to-headcount once we have hired data
    fill_rate: float | None = None  # placeholder

    # ---- Roles (grouped by team) ----
    roles_rows: list[dict[str, Any]] = []
    if not listed_open.empty:
        for _, r in listed_open.iterrows():
            jid = str(r["job_id"])
            roles_rows.append({
                "job_id": jid,
                "title": str(r.get("title")),
                "team": _team_for_job(job_postings, jid) or "Other",
                "hiring_manager": r.get("hiring_manager"),
                "applicants": int(r.get("applied", 0)),
                "in_review": int(_review_for_job(apps_scoped, jid)),
                "in_interview": int(r.get("in_interview", 0)),
                "offer": int(r.get("offer", 0)),
                "rejected": int(r.get("rejected", 0)),
            })

    grouped_roles: list[dict[str, Any]] = []
    by_team: dict[str, list[dict[str, Any]]] = {}
    for r in roles_rows:
        by_team.setdefault(r["team"], []).append(r)
    for team in sorted(by_team.keys(), key=lambda x: x.lower()):
        items = sorted(by_team[team], key=lambda r: -r["applicants"])
        total = {
            "applicants": sum(r["applicants"] for r in items),
            "in_review": sum(r["in_review"] for r in items),
            "in_interview": sum(r["in_interview"] for r in items),
            "offer": sum(r["offer"] for r in items),
            "rejected": sum(r["rejected"] for r in items),
        }
        grouped_roles.append({"team": team, "total": total, "roles": items})

    # ---- Weekly applications by source (last 7 days) ----
    weekly_by_source: list[dict[str, Any]] = []
    if not apps_scoped.empty and "createdAt" in apps_scoped.columns:
        now = pd.Timestamp.now(tz="UTC")
        week_ago = now - pd.Timedelta(days=7)
        created = _ts(apps_scoped["createdAt"])
        recent = apps_scoped.loc[(created >= week_ago) & (created <= now)].copy()
        if not recent.empty:
            recent["_date"] = created.loc[recent.index].dt.date
            src_col = "source.title" if "source.title" in recent.columns else None
            recent["_src"] = recent[src_col].astype(str) if src_col else "Unknown"
            recent = recent[~recent["_src"].isin({"Kula_Migrated", "Migrated_Kula", "Unspecified", "nan"})]
            grp = recent.groupby(["_date", "_src"], as_index=False).size().rename(columns={"size": "count"})
            weekly_by_source = [
                {"date": str(r["_date"]), "source": str(r["_src"]), "count": int(r["count"])}
                for _, r in grp.iterrows()
            ]

    # ---- Stuck candidates (SLA-breach in current stage, listed+open scope) ----
    stuck: list[dict[str, Any]] = []
    if residents is not None and not residents.empty:
        scoped = residents[residents["is_listed_open"]].copy() if "is_listed_open" in residents.columns else residents.copy()
        if not scoped.empty:
            def _breach(row: pd.Series) -> bool:
                sla = STAGE_SLA_DAYS.get(str(row.get("stage_title")))
                if sla is None:
                    return False
                try:
                    return float(row.get("days_in_stage", 0)) >= sla
                except (TypeError, ValueError):
                    return False

            scoped["_breach"] = scoped.apply(_breach, axis=1)
            breached = scoped[scoped["_breach"]].sort_values("days_in_stage", ascending=False).head(10)
            stuck = to_records(
                breached[[
                    "application_id", "candidate_id", "candidate_name",
                    "job_id", "job_title", "hiring_manager",
                    "stage_title", "days_in_stage",
                ]]
            )

    return envelope(
        {
            "kpis": {
                "applicants": applicants,
                "in_review": in_review,
                "in_interview": in_interview,
                "rejected": rejected,
                "conversion_pct": conversion_pct,
                "fill_rate": fill_rate,
            },
            "roles_by_team": grouped_roles,
            "total_roles": len(roles_rows),
            "weekly_by_source": weekly_by_source,
            "stuck": stuck,
        },
        last_sync_at=registry.snapshot().get("loadedAt"),
    )


def _review_for_job(apps_scoped: pd.DataFrame, job_id: str) -> int:
    if apps_scoped.empty or "job.id" not in apps_scoped.columns:
        return 0
    sub = apps_scoped[apps_scoped["job.id"].astype(str) == job_id]
    if sub.empty:
        return 0
    stype = _col(sub, "currentInterviewStage.type").astype(str)
    return int((stype == "PreInterviewScreen").sum())
