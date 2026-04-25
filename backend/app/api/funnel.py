"""/api/funnel — the per-role × stage matrix.

Rows: roles (listed + open). Columns: App Review · R1 · R2 · R3 · R4 · Final ·
Offer · Rejected. Grouped by team (job_postings.teamName) so the UI can render
collapsible sections.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from fastapi import APIRouter

from app.api._common import envelope, to_records
from app.cache.registry import registry

router = APIRouter()

STAGES = [
    ("application_review", "Application Review"),
    ("round_1", "Round 1"),
    ("round_2", "Round 2"),
    ("round_3", "Round 3"),
    ("round_4", "Round 4"),
    ("final_round", "Final"),
    ("offer", "Offer"),
    ("rejected", "Rejected"),
]


# Team groupings the user wants surfaced when present in role titles.
# Order matters — first match wins so "API Platform" beats "API".
_TEAM_KEYWORDS: list[tuple[str, str]] = [
    ("API Platform", "API Platform"),
    ("API Team", "API Team"),
    ("Vision", "Vision"),
    ("Chanakya", "Chanakya"),
    ("Samvaad", "Samvaad"),
    ("Models", "Models"),
    ("Speech", "Speech"),
    ("Voice", "Voice"),
    ("Foundation", "Foundation Models"),
]


def _subteam_from_title(title: str) -> str | None:
    if not title:
        return None
    t = str(title)
    # explicit ", X" suffix is the cleanest signal Sarvam uses
    if "," in t:
        suffix = t.rsplit(",", 1)[1].strip()
        if suffix:
            for kw, label in _TEAM_KEYWORDS:
                if kw.lower() in suffix.lower():
                    return label
            # otherwise the suffix itself is the team (e.g. "Enterprise Sales")
            return suffix
    # no comma — keyword search across the whole title
    for kw, label in _TEAM_KEYWORDS:
        if kw.lower() in t.lower():
            return label
    return None


def _team_for_job(job_postings: pd.DataFrame, job_id: str) -> str | None:
    """Subteam (Vision/Chanakya/...) preferred from title; fallback to
    job_postings.teamName, then departmentName."""
    title: str | None = None
    team_name: str | None = None
    department: str | None = None

    if job_postings is not None and not job_postings.empty and "jobId" in job_postings.columns:
        sub = job_postings.loc[job_postings["jobId"].astype(str) == job_id]
        if not sub.empty:
            row = sub.iloc[0]
            title = row.get("title") if isinstance(row.get("title"), str) else None
            if "teamName" in sub.columns:
                v = row.get("teamName")
                if isinstance(v, str) and v.strip():
                    team_name = v
            if "departmentName" in sub.columns:
                v = row.get("departmentName")
                if isinstance(v, str) and v.strip():
                    department = v

    sub_from_title = _subteam_from_title(title or "")
    if sub_from_title:
        return sub_from_title
    return team_name or department


@router.get("/api/funnel")
def funnel_matrix() -> dict[str, Any]:
    rs = registry.derived("role_summary")
    apps = registry.get("applications")
    job_postings = registry.get("job_postings")

    if rs is None or rs.empty:
        return envelope(
            {"stages": [s[1] for s in STAGES], "groups": [], "totals": _zero_row()},
            last_sync_at=registry.snapshot().get("loadedAt"),
        )

    listed_open = rs[rs["is_listed_open"]].copy() if "is_listed_open" in rs.columns else rs.copy()

    # application_review count per job — application_review = stage_type == PreInterviewScreen
    review_by_job: dict[str, int] = {}
    if apps is not None and not apps.empty and "job.id" in apps.columns:
        st = apps.get("currentInterviewStage.type")
        st = st if st is not None else pd.Series([None] * len(apps))
        mask = st.astype(str) == "PreInterviewScreen"
        ar = apps.loc[mask].groupby(apps["job.id"].astype(str)).size().to_dict()
        review_by_job = {str(k): int(v) for k, v in ar.items()}

    rows = []
    for _, r in listed_open.iterrows():
        job_id = str(r["job_id"])
        rows.append({
            "job_id": job_id,
            "title": str(r.get("title")),
            "team": _team_for_job(job_postings, job_id) or "Other",
            "hiring_manager": r.get("hiring_manager"),
            "application_review": int(review_by_job.get(job_id, 0)),
            "round_1": int(r.get("round_1", 0)),
            "round_2": int(r.get("round_2", 0)),
            "round_3": int(r.get("round_3", 0)),
            "round_4": int(r.get("round_4", 0)),
            "final_round": int(r.get("final_round", 0)),
            "offer": int(r.get("offer", 0)),
            "rejected": int(r.get("rejected", 0)),
            "applied": int(r.get("applied", 0)),
            "live": int(r.get("live", 0)),
        })

    # group by team
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        groups.setdefault(row["team"], []).append(row)

    grouped = []
    for team, items in sorted(groups.items(), key=lambda kv: kv[0].lower()):
        items.sort(key=lambda r: -r["applied"])
        team_total = _sum_row(items)
        team_total["team"] = team
        team_total["title"] = f"All {team}"
        team_total["job_id"] = None
        team_total["hiring_manager"] = None
        grouped.append({"team": team, "total": team_total, "roles": items})

    overall_total = _sum_row(rows)
    overall_total["team"] = "All"
    overall_total["title"] = "All listed + open roles"
    overall_total["job_id"] = None

    return envelope(
        {
            "stages": [label for _, label in STAGES],
            "groups": grouped,
            "totals": overall_total,
            "total_roles": len(rows),
        },
        last_sync_at=registry.snapshot().get("loadedAt"),
    )


def _sum_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    keys = [k for k, _ in STAGES] + ["applied", "live"]
    return {k: sum(int(r.get(k, 0)) for r in rows) for k in keys}


def _zero_row() -> dict[str, int]:
    keys = [k for k, _ in STAGES] + ["applied", "live"]
    return {k: 0 for k in keys}
