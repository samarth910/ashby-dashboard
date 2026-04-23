"""Sync orchestrator. Fetches all entities in parallel under the client's
org-wide semaphore. On syncTokenExpired: downgrade that entity to full, keep
other entities' tokens intact, never fail the whole run.

Upsert policy for incremental runs:
- If the entity has a primary key and an existing parquet exists, we merge by
  overwriting rows with matching PKs. Pure insert-only entities (application
  history) are concatenated.
- If no existing parquet (first run), we just write the fetched rows.

Writes go through cache.store (atomic). Derived tables are NOT computed here;
cache.derived owns that and is invoked from the API layer (Phase 2+).
"""

from __future__ import annotations

import asyncio
import gc
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd

from app.ashby.client import AshbyClient, AshbyError, AshbyTokenExpired
from app.ashby.entities import ENTITIES, Entity
from app.ashby.history import apps_needing_history, fan_out_history, merge_history
from app.ashby.paginator import fetch_all
from app.cache import store

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, str, dict[str, Any]], None]  # (entity_name, event, payload)

# Entities whose full list won't fit comfortably alongside another full list
# on a 512 MB Railway Hobby container. We run these sequentially.
_HEAVY = {"candidates", "applications"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _merge_incremental(existing: pd.DataFrame, new: pd.DataFrame, pk: str | None) -> pd.DataFrame:
    if existing.empty:
        return new
    if new.empty:
        return existing
    if pk is None or pk not in new.columns or pk not in existing.columns:
        # no stable key -> append (dedupe downstream)
        return pd.concat([existing, new], ignore_index=True)
    keep = existing[~existing[pk].isin(new[pk])]
    return pd.concat([keep, new], ignore_index=True)


async def _sync_application_history(
    client: AshbyClient,
    base_results: list[Any],
    on_entity_event: ProgressCallback | None,
    *,
    force_full: bool,
) -> dict[str, Any] | None:
    """Fan out application.listHistory for every changed application.

    Depends on the applications parquet being freshly written by the base pass.
    Failure here is isolated: we log, surface in sync_state, and move on.
    """
    name = "application_history"
    start = time.perf_counter()
    if on_entity_event:
        on_entity_event(name, "started", {})

    # locate applications result in the base pass; skip if it failed
    apps_idx = next((i for i, e in enumerate(ENTITIES) if e.name == "applications"), None)
    if apps_idx is None or isinstance(base_results[apps_idx], Exception):
        payload = {
            "lastError": "applications pass failed; skipping history",
            "durationSec": 0.0,
        }
        if on_entity_event:
            on_entity_event(name, "completed", payload)
        return payload

    applications = store.load_entity("applications") or pd.DataFrame()
    existing = None if force_full else store.load_entity("application_history")

    todo = apps_needing_history(applications, existing)
    total_apps = int(len(applications)) if not applications.empty else 0
    if not todo:
        logger.info("application_history: nothing to fetch (all %d apps up-to-date)", total_apps)
        payload = {
            "rowCount": 0 if existing is None else int(len(existing)),
            "fetchedThisRun": 0,
            "durationSec": round(time.perf_counter() - start, 2),
            "lastIncrementalSync": _now_iso(),
            "lastRunKind": "incremental-noop",
        }
        if on_entity_event:
            on_entity_event(name, "completed", payload)
        return payload

    logger.info(
        "application_history: fan-out starting (%d of %d apps need refresh)",
        len(todo), total_apps,
    )

    def _progress(done: int, total: int, failed: int) -> None:
        logger.info("application_history: %d/%d fetched (%d failed)", done, total, failed)

    try:
        fresh = await fan_out_history(client, todo, on_progress=_progress)
    except Exception as exc:
        logger.exception("application_history fan-out crashed")
        payload = {
            "lastError": f"{type(exc).__name__}: {exc}",
            "durationSec": round(time.perf_counter() - start, 2),
        }
        if on_entity_event:
            on_entity_event(name, "failed", payload)
        return payload

    merged = merge_history(existing, fresh, refetched_ids=todo)
    store.write_entity(name, merged)

    duration = round(time.perf_counter() - start, 2)
    now = _now_iso()
    kind = "full" if existing is None or force_full else "incremental"
    logger.info("application_history: %s - merged %d rows in %.1fs", kind, len(merged), duration)
    payload = {
        "supportsSyncToken": False,
        "syncToken": None,
        "lastFullSync": now if kind == "full" else None,
        "lastIncrementalSync": now if kind == "incremental" else None,
        "lastError": None,
        "rowCount": int(len(merged)),
        "fetchedThisRun": int(len(todo)),
        "durationSec": duration,
        "lastRunKind": kind,
    }
    if on_entity_event:
        on_entity_event(name, "completed", payload)
    return payload


async def sync_entity(
    client: AshbyClient,
    entity: Entity,
    saved_token: str | None,
    *,
    force_full: bool = False,
) -> dict[str, Any]:
    """Fetch + write one entity. Returns a sync_state entry."""
    start = time.perf_counter()
    use_token = None if force_full else (saved_token if entity.supports_sync_token else None)
    kind: str
    try:
        rows, final_token = await fetch_all(client, entity.endpoint, sync_token=use_token)
        kind = "incremental" if use_token else "full"
    except AshbyTokenExpired:
        logger.warning("%s: syncToken expired, downgrading to full", entity.name)
        rows, final_token = await fetch_all(client, entity.endpoint, sync_token=None)
        kind = "full-after-expiry"

    new_df = pd.json_normalize(rows) if rows else pd.DataFrame()

    if kind == "incremental":
        existing = store.load_entity(entity.name)
        df_to_write = _merge_incremental(
            existing if existing is not None else pd.DataFrame(),
            new_df,
            entity.pk,
        )
    else:
        df_to_write = new_df

    store.write_entity(entity.name, df_to_write)
    duration = round(time.perf_counter() - start, 2)
    logger.info(
        "%s: %s - fetched %d rows in %.2fs (total on disk %d)",
        entity.name, kind, len(rows), duration, len(df_to_write),
    )

    now = _now_iso()
    return {
        "supportsSyncToken": entity.supports_sync_token,
        "syncToken": final_token if entity.supports_sync_token else None,
        "lastFullSync": now if kind != "incremental" else None,
        "lastIncrementalSync": now if kind == "incremental" else None,
        "lastError": None,
        "rowCount": int(len(df_to_write)),
        "fetchedThisRun": int(len(rows)),
        "durationSec": duration,
        "lastRunKind": kind,
    }


async def run_sync(
    *,
    full: bool = False,
    on_entity_event: ProgressCallback | None = None,
) -> dict[str, Any]:
    """Run a full or incremental sync across all 13 entities in parallel.

    `on_entity_event` (if given) is called with (entity_name, event, payload)
    where event is one of "started" | "completed" | "failed".
    """
    prev_state = store.read_sync_state()
    prev_entities = dict(prev_state.get("entities", {}))

    started = _now_iso()
    t0 = time.perf_counter()

    async with AshbyClient() as client:

        async def _wrap(e: Entity, saved_token: str | None) -> dict[str, Any]:
            if on_entity_event:
                on_entity_event(e.name, "started", {})
            try:
                result = await sync_entity(client, e, saved_token, force_full=full)
            except Exception as exc:
                if on_entity_event:
                    on_entity_event(e.name, "failed", {"error": f"{type(exc).__name__}: {exc}"})
                raise
            if on_entity_event:
                on_entity_event(e.name, "completed", result)
            return result

        # Memory discipline: small entities run in parallel (their DFs are tiny),
        # then the two big ones (candidates + applications) run sequentially so
        # their page lists never coexist in memory. Each is gc.collect()'d after.
        results_by_name: dict[str, Any] = {}

        light = [e for e in ENTITIES if e.name not in _HEAVY]
        heavy = [e for e in ENTITIES if e.name in _HEAVY]

        light_tasks = []
        for e in light:
            saved_token = prev_entities.get(e.name, {}).get("syncToken")
            light_tasks.append(_wrap(e, saved_token))
        light_res = await asyncio.gather(*light_tasks, return_exceptions=True)
        for e, r in zip(light, light_res):
            results_by_name[e.name] = r
        gc.collect()

        for e in heavy:
            saved_token = prev_entities.get(e.name, {}).get("syncToken")
            try:
                r: Any = await _wrap(e, saved_token)
            except Exception as exc:
                r = exc
            results_by_name[e.name] = r
            gc.collect()

        # ordered results matching ENTITIES (runner builds new_state below in that order)
        results = [results_by_name[e.name] for e in ENTITIES]

        # Phase 2: application history. application.listHistory is gated behind
        # applicationId so we fan out. Incremental by default — full re-fetch only
        # for apps whose updatedAt moved past the cached history.
        history_result = await _sync_application_history(
            client, results, on_entity_event, force_full=full
        )
        gc.collect()

    new_entities: dict[str, Any] = dict(prev_entities)
    for entity, result in zip(ENTITIES, results):
        prev = new_entities.get(entity.name, {})
        if isinstance(result, Exception):
            logger.error("%s: FAILED - %s", entity.name, result)
            prev["lastError"] = f"{type(result).__name__}: {result}"
            new_entities[entity.name] = prev
            continue

        # merge, preserving fields we didn't update this run (e.g. lastFullSync when incremental)
        for k, v in result.items():
            if v is not None or k not in prev:
                prev[k] = v
        new_entities[entity.name] = prev

    # Fold history-phase result into the same sync_state shape
    if history_result is not None:
        prev = new_entities.get("application_history", {})
        for k, v in history_result.items():
            if v is not None or k not in prev:
                prev[k] = v
        new_entities["application_history"] = prev

    new_state = {
        "version": 1,
        "lastRunStartedAt": started,
        "lastRunCompletedAt": _now_iso(),
        "lastRunKind": "full" if full else "incremental",
        "lastRunDurationSec": round(time.perf_counter() - t0, 2),
        "entities": new_entities,
    }
    store.write_sync_state(new_state)
    return new_state
