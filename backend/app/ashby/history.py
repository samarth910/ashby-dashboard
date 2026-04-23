"""application.listHistory fan-out.

Ashby gates stage-history behind `applicationId`, so we fire one call per
application. 20k applications × ~200 ms / 8 concurrent ≈ 8 min one-time.

Incremental strategy:
- If application_history.parquet is missing -> full fan-out for every known application.
- Else, for each application, refetch history only when `applications.updatedAt`
  is newer than the latest `entered_at` we already stored for that app (a proxy
  for "something moved"). New applications with no history yet always fetch.

Stored schema (one row per stage entry):
  application_id, history_id, stage_title, stage_id, stage_number, stage_type,
  entered_at (UTC), left_at (UTC or NaT), duration_seconds, is_current
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import pandas as pd

from app.ashby.client import AshbyClient

logger = logging.getLogger(__name__)


# Map stage.title -> type bucket (mirrors what currentInterviewStage.type reports).
# We key off title because application.listHistory does not return the type.
_INTERVIEW_TITLES = {"Round 1", "Round 2", "Round 3", "Round 4", "Final", "Onsite"}


def _stage_type_from_title(title: str) -> str:
    t = (title or "").strip()
    if t == "Application Review":
        return "PreInterviewScreen"
    if t == "Archived":
        return "Archived"
    if t == "Offer":
        return "Offer"
    if t == "Hired":
        return "Hired"
    if t in ("Lead", "New Lead"):
        return "Lead"
    if t in _INTERVIEW_TITLES:
        return "Active"
    return "Active"  # default: treat unknown interview-round titles as Active


async def fetch_one_history(client: AshbyClient, application_id: str) -> list[dict[str, Any]]:
    resp = await client.call("application.listHistory", {"applicationId": application_id})
    return resp.get("results") or []


def _to_rows(application_id: str, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in results:
        entered = r.get("enteredStageAt")
        left = r.get("leftStageAt")
        duration = None
        if entered and left:
            try:
                e = pd.to_datetime(entered, utc=True)
                l = pd.to_datetime(left, utc=True)
                duration = (l - e).total_seconds()
            except Exception:
                duration = None
        out.append({
            "application_id": application_id,
            "history_id": r.get("id"),
            "stage_title": r.get("title"),
            "stage_id": r.get("stageId"),
            "stage_number": r.get("stageNumber"),
            "stage_type": _stage_type_from_title(r.get("title") or ""),
            "entered_at": entered,
            "left_at": left,
            "duration_seconds": duration,
            "is_current": left is None,
        })
    return out


def apps_needing_history(
    applications: pd.DataFrame,
    existing_history: pd.DataFrame | None,
) -> list[str]:
    """Return application ids whose history we must (re)fetch."""
    if applications.empty or "id" not in applications.columns:
        return []
    all_ids = applications["id"].astype(str).tolist()
    if existing_history is None or existing_history.empty:
        return all_ids

    # Latest entered_at per app in the cached history
    eh = existing_history.copy()
    eh["entered_at"] = pd.to_datetime(eh["entered_at"], utc=True, errors="coerce")
    latest = eh.groupby("application_id")["entered_at"].max()

    app_updated = pd.to_datetime(applications["updatedAt"], utc=True, errors="coerce")
    app_index = pd.Series(app_updated.values, index=applications["id"].astype(str))

    todo: list[str] = []
    for aid in all_ids:
        if aid not in latest.index:
            todo.append(aid)
            continue
        last_known = latest[aid]
        updated = app_index.get(aid)
        if pd.isna(last_known) or updated is None or pd.isna(updated):
            todo.append(aid)
            continue
        if updated > last_known:
            todo.append(aid)
    return todo


async def fan_out_history(
    client: AshbyClient,
    app_ids: list[str],
    on_progress: "callable" = None,  # type: ignore[valid-type]
) -> pd.DataFrame:
    """Call application.listHistory for every id in parallel (bounded by the
    client's semaphore). Returns a DataFrame of new history rows."""
    if not app_ids:
        return pd.DataFrame(
            columns=[
                "application_id", "history_id", "stage_title", "stage_id",
                "stage_number", "stage_type", "entered_at", "left_at",
                "duration_seconds", "is_current",
            ]
        )

    rows: list[dict[str, Any]] = []
    done = 0
    failed = 0
    total = len(app_ids)

    async def _one(aid: str) -> None:
        nonlocal done, failed
        try:
            results = await fetch_one_history(client, aid)
            rows.extend(_to_rows(aid, results))
        except Exception as exc:  # swallow per-app failures so one bad id doesn't kill the batch
            failed += 1
            logger.debug("history fetch failed for %s: %s", aid, exc)
        finally:
            done += 1
            if on_progress and (done == total or done % 200 == 0):
                on_progress(done, total, failed)

    await asyncio.gather(*[_one(a) for a in app_ids])
    logger.info("history fan-out: %d/%d fetched (%d failed)", done - failed, total, failed)
    return pd.DataFrame(rows)


def merge_history(
    existing: pd.DataFrame | None,
    fresh: pd.DataFrame,
    refetched_ids: list[str],
) -> pd.DataFrame:
    """Replace-in-place: drop all rows for the refetched ids, append fresh ones.
    This guarantees the cached history for any fetched app is authoritative."""
    if fresh.empty and (existing is None or existing.empty):
        return pd.DataFrame(columns=[
            "application_id", "history_id", "stage_title", "stage_id",
            "stage_number", "stage_type", "entered_at", "left_at",
            "duration_seconds", "is_current",
        ])
    if existing is None or existing.empty:
        return fresh.reset_index(drop=True)
    keep = existing[~existing["application_id"].astype(str).isin(set(refetched_ids))]
    if fresh.empty:
        return keep.reset_index(drop=True)
    return pd.concat([keep, fresh], ignore_index=True)
