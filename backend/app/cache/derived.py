"""Derived tables pre-computed after every sync.

Tied to the real Ashby schema returned by job.list / application.list. Key
column names:
  jobs:          id, title, status (Open/Closed/Archived), departmentId, locationId,
                 openedAt, createdAt, hiringTeam (array of {userId, role, firstName, lastName}).
  applications:  id, status (Active/Archived/Lead), createdAt, updatedAt, archivedAt,
                 job.id, job.title, currentInterviewStage.title, currentInterviewStage.type.

For v1 we do NOT have application_history (that endpoint requires per-application
fan-out; deferred). So "stage_movement_daily" is computed from createdAt dates
as a proxy, and time-in-stage metrics use updatedAt - createdAt.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

HIDDEN_SOURCES = {"Kula_Migrated", "Migrated_Kula", "Unspecified"}

# stage.type values Ashby uses
STAGE_TYPE_INTERVIEW = "Active"   # actively interviewing
STAGE_TYPE_OFFER = "Offer"
STAGE_TYPE_HIRED = "Hired"
STAGE_TYPE_ARCHIVED = "Archived"
STAGE_TYPE_LEAD = "Lead"
STAGE_TYPE_REVIEW = "PreInterviewScreen"


def _col(df: pd.DataFrame, name: str, default: Any = None) -> pd.Series:
    if name in df.columns:
        return df[name]
    return pd.Series([default] * len(df), index=df.index, name=name)


def _ts(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce")


def _now() -> pd.Timestamp:
    return pd.Timestamp.now(tz="UTC")


def _extract_hiring_team_role(team: Any, role: str) -> str | None:
    """hiringTeam is a numpy array of dicts; extract the first member matching role."""
    if team is None:
        return None
    try:
        for member in team:
            if isinstance(member, dict) and member.get("role") == role:
                fn = member.get("firstName") or ""
                ln = member.get("lastName") or ""
                full = f"{fn} {ln}".strip()
                return full or member.get("email") or None
    except TypeError:
        return None
    return None


def compute_role_summary(entities: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """One row per job. Columns surface the five funnel buckets: applied, live,
    in_interview, offer, rejected — plus `is_listed` (has any jobPosting with
    isListed=True) and `is_open` (status == Open). The Overview roles table
    filters to is_listed AND is_open."""
    jobs = entities.get("jobs", pd.DataFrame())
    apps = entities.get("applications", pd.DataFrame())
    job_postings = entities.get("job_postings", pd.DataFrame())
    departments = entities.get("departments", pd.DataFrame())
    locations = entities.get("locations", pd.DataFrame())

    if jobs.empty:
        return pd.DataFrame()

    j = jobs.copy()
    j["job_id"] = j["id"].astype(str)

    # department / location names via lookup tables
    dep_name = (
        departments.set_index(departments["id"].astype(str))["name"]
        if not departments.empty and "id" in departments.columns and "name" in departments.columns
        else pd.Series(dtype=str)
    )
    loc_name = (
        locations.set_index(locations["id"].astype(str))["name"]
        if not locations.empty and "id" in locations.columns and "name" in locations.columns
        else pd.Series(dtype=str)
    )
    j["department"] = _col(j, "departmentId").astype(str).map(dep_name)
    j["location"] = _col(j, "locationId").astype(str).map(loc_name)

    # hiring manager / recruiter from hiringTeam
    team = _col(j, "hiringTeam", default=None)
    j["hiring_manager"] = team.apply(lambda t: _extract_hiring_team_role(t, "Hiring Manager"))
    j["recruiter"] = team.apply(lambda t: _extract_hiring_team_role(t, "Recruiter"))

    # listed flag: any jobPosting for this job with isListed=True
    listed_job_ids: set[str] = set()
    if not job_postings.empty and "isListed" in job_postings.columns and "jobId" in job_postings.columns:
        listed_job_ids = set(
            job_postings.loc[job_postings["isListed"].astype(bool), "jobId"].astype(str)
        )
    j["is_listed"] = j["job_id"].isin(listed_job_ids)
    j["is_open"] = j["status"].astype(str).eq("Open")
    j["is_listed_open"] = j["is_listed"] & j["is_open"]

    # days open: openedAt (fallback createdAt); used on /roles not on Overview
    opened = _ts(_col(j, "openedAt")).fillna(_ts(_col(j, "createdAt")))
    j["days_open"] = ((_now() - opened).dt.total_seconds() / 86400).round().astype("Int64")

    # five funnel buckets per job
    counts = _counts_by_job(apps)
    j = j.merge(counts, how="left", on="job_id")
    for c in ["applied", "live", "in_interview", "offer", "rejected", "hired"]:
        if c not in j.columns:
            j[c] = 0
        j[c] = j[c].fillna(0).astype(int)

    # most recent activity
    if not apps.empty and "job.id" in apps.columns and "updatedAt" in apps.columns:
        upd = apps.assign(_jid=apps["job.id"].astype(str)).groupby("_jid")["updatedAt"].max()
        j["last_activity_at"] = j["job_id"].map(upd)
    else:
        j["last_activity_at"] = pd.NaT

    out = j[[
        "job_id", "title", "status",
        "is_listed", "is_open", "is_listed_open",
        "department", "location",
        "hiring_manager", "recruiter",
        "days_open",
        "applied", "live", "in_interview", "offer", "rejected", "hired",
        "last_activity_at",
    ]].copy()
    return out


def _counts_by_job(apps: pd.DataFrame) -> pd.DataFrame:
    cols = ["job_id", "applied", "live", "in_interview", "offer", "rejected", "hired"]
    if apps.empty or "job.id" not in apps.columns:
        return pd.DataFrame(columns=cols)
    stage_type = _col(apps, "currentInterviewStage.type").astype(str)
    status = _col(apps, "status").astype(str)
    df = pd.DataFrame({
        "job_id": apps["job.id"].astype(str),
        "applied": 1,
        "live": (~status.isin([STAGE_TYPE_ARCHIVED, STAGE_TYPE_HIRED])).astype(int),
        "in_interview": (stage_type == STAGE_TYPE_INTERVIEW).astype(int),
        "offer": (stage_type == STAGE_TYPE_OFFER).astype(int),
        "rejected": (status == STAGE_TYPE_ARCHIVED).astype(int),
        "hired": (stage_type == STAGE_TYPE_HIRED).astype(int),
    })
    return df.groupby("job_id", as_index=False).sum(numeric_only=True)


def compute_stage_movement_daily(entities: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Real stage-entry counts per day over the last 90 days, from
    application_history.entered_at. Falls back to createdAt proxy if history
    is not yet cached."""
    hist = entities.get("application_history", pd.DataFrame())
    if not hist.empty and "entered_at" in hist.columns and "stage_title" in hist.columns:
        entered = _ts(hist["entered_at"])
        df = pd.DataFrame({"date": entered.dt.date, "stage": hist["stage_title"].astype(str)}).dropna()
        cutoff = (_now() - pd.Timedelta(days=90)).date()
        df = df[df["date"] >= cutoff]
        return (
            df.groupby(["date", "stage"], as_index=False).size().rename(columns={"size": "entered_count"})
        )

    apps = entities.get("applications", pd.DataFrame())
    if apps.empty or "createdAt" not in apps.columns:
        return pd.DataFrame(columns=["date", "stage", "entered_count"])
    created = _ts(apps["createdAt"])
    stage = _col(apps, "currentInterviewStage.title").astype(str)
    df = pd.DataFrame({"date": created.dt.date, "stage": stage}).dropna()
    cutoff = (_now() - pd.Timedelta(days=90)).date()
    df = df[df["date"] >= cutoff]
    return (
        df.groupby(["date", "stage"], as_index=False)
        .size()
        .rename(columns={"size": "entered_count"})
    )


def compute_stage_current_residents(entities: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """One row per currently-active application, with the stage they are in
    NOW and the exact timestamp they entered it (from history when available).

    This is the table every rounds view reads from. Columns:
      application_id, candidate_id, candidate_name, job_id, job_title,
      department, location, hiring_manager, source_title,
      stage_title, stage_type, stage_number,
      entered_stage_at, days_in_stage, is_listed_open
    """
    apps = entities.get("applications", pd.DataFrame())
    hist = entities.get("application_history", pd.DataFrame())
    role_summary = entities.get("role_summary", pd.DataFrame())  # optional, for is_listed_open + hm

    cols = [
        "application_id", "candidate_id", "candidate_name", "job_id", "job_title",
        "department", "location", "hiring_manager", "source_title",
        "stage_title", "stage_type", "stage_number",
        "entered_stage_at", "days_in_stage", "is_listed_open",
    ]
    if apps.empty:
        return pd.DataFrame(columns=cols)

    status = _col(apps, "status").astype(str)
    active = apps[~status.isin(["Archived", "Hired"])].copy()
    if active.empty:
        return pd.DataFrame(columns=cols)

    # resolve entered_at from history (is_current==True row per application)
    entered_map: dict[str, tuple[Any, Any]] = {}  # app_id -> (entered_at, stage_number)
    if not hist.empty and {"application_id", "is_current", "entered_at"}.issubset(hist.columns):
        cur = hist[hist["is_current"].astype(bool) == True].copy()
        if not cur.empty:
            cur["entered_at_ts"] = _ts(cur["entered_at"])
            # if multiple current rows, pick latest
            cur = cur.sort_values("entered_at_ts").drop_duplicates("application_id", keep="last")
            for _, r in cur.iterrows():
                entered_map[str(r["application_id"])] = (r["entered_at_ts"], r.get("stage_number"))

    app_id = active["id"].astype(str)
    entered_values = app_id.map(lambda a: entered_map.get(a, (pd.NaT, None))[0])
    stage_number = app_id.map(lambda a: entered_map.get(a, (pd.NaT, None))[1])
    entered = pd.to_datetime(
        pd.Series(entered_values.values, index=active.index), utc=True, errors="coerce"
    )
    # fallback: use applications.updatedAt as proxy when history missing for this app
    if "updatedAt" in active.columns:
        fallback = _ts(active["updatedAt"])
        entered = entered.fillna(fallback)
    days = ((_now() - entered).dt.total_seconds() / 86400).round(1)

    listed_open_map: dict[str, bool] = {}
    hiring_manager_map: dict[str, str] = {}
    department_map: dict[str, str] = {}
    location_map: dict[str, str] = {}
    if role_summary is not None and not role_summary.empty:
        for _, r in role_summary.iterrows():
            jid = str(r.get("job_id"))
            listed_open_map[jid] = bool(r.get("is_listed_open", False))
            hiring_manager_map[jid] = r.get("hiring_manager")
            department_map[jid] = r.get("department")
            location_map[jid] = r.get("location")

    jobs = entities.get("jobs", pd.DataFrame())
    if not hiring_manager_map and not jobs.empty and "hiringTeam" in jobs.columns:
        for _, r in jobs.iterrows():
            jid = str(r["id"])
            hiring_manager_map[jid] = _extract_hiring_team_role(r.get("hiringTeam"), "Hiring Manager")

    job_id = _col(active, "job.id").astype(str)
    out = pd.DataFrame({
        "application_id": app_id.values,
        "candidate_id": _col(active, "candidate.id").astype(str).values,
        "candidate_name": _col(active, "candidate.name").astype(str).values,
        "job_id": job_id.values,
        "job_title": _col(active, "job.title").astype(str).values,
        "department": job_id.map(department_map).values,
        "location": job_id.map(location_map).values,
        "hiring_manager": job_id.map(hiring_manager_map).values,
        "source_title": _col(active, "source.title").astype(str).values,
        "stage_title": _col(active, "currentInterviewStage.title").astype(str).values,
        "stage_type": _col(active, "currentInterviewStage.type").astype(str).values,
        "stage_number": stage_number.values,
        "entered_stage_at": entered.values,
        "days_in_stage": days.values,
        "is_listed_open": job_id.map(listed_open_map).fillna(False).astype(bool).values,
    })
    return out


def compute_source_performance(entities: dict[str, pd.DataFrame]) -> pd.DataFrame:
    apps = entities.get("applications", pd.DataFrame())
    if apps.empty or "source.title" not in apps.columns:
        return pd.DataFrame(columns=[
            "source", "window", "applied", "past_review",
            "to_interview", "offered", "hired",
        ])

    created = _ts(apps["createdAt"]) if "createdAt" in apps.columns else pd.Series(pd.NaT, index=apps.index)
    stage_type = _col(apps, "currentInterviewStage.type").astype(str)
    frame = pd.DataFrame({
        "source": apps["source.title"].astype(str),
        "created": created,
        "stage_type": stage_type,
    })
    frame = frame[~frame["source"].isin(HIDDEN_SOURCES) & frame["source"].ne("nan")]

    now = _now()
    windows = {"7d": 7, "30d": 30, "90d": 90, "all": None}
    rows: list[dict[str, Any]] = []
    for label, days in windows.items():
        sub = frame if days is None else frame[frame["created"] >= now - pd.Timedelta(days=days)]
        if sub.empty:
            continue
        for src, g in sub.groupby("source"):
            past_review = int((g["stage_type"] != STAGE_TYPE_REVIEW).sum())
            to_interview = int(g["stage_type"].isin([STAGE_TYPE_INTERVIEW, STAGE_TYPE_OFFER, STAGE_TYPE_HIRED]).sum())
            offered = int((g["stage_type"] == STAGE_TYPE_OFFER).sum())
            hired = int((g["stage_type"] == STAGE_TYPE_HIRED).sum())
            rows.append({
                "source": src,
                "window": label,
                "applied": int(len(g)),
                "past_review": past_review,
                "to_interview": to_interview,
                "offered": offered,
                "hired": hired,
            })
    return pd.DataFrame(rows)


def compute_all(entities: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    role_summary = compute_role_summary(entities)
    # stage_current_residents wants role_summary for hm / is_listed_open joins
    ents_with_rs = dict(entities)
    ents_with_rs["role_summary"] = role_summary
    return {
        "role_summary": role_summary,
        "stage_movement_daily": compute_stage_movement_daily(entities),
        "source_performance": compute_source_performance(entities),
        "stage_current_residents": compute_stage_current_residents(ents_with_rs),
    }
