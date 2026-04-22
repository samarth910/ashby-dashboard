"""/api/sources — source performance table + this-week share."""

from __future__ import annotations

import pandas as pd
from fastapi import APIRouter

from app.api._common import envelope, to_records
from app.cache.registry import registry

router = APIRouter()


def _ts(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, utc=True, errors="coerce")


@router.get("/api/sources")
def sources() -> dict:
    perf = registry.derived("source_performance")
    apps = registry.get("applications")

    table = to_records(perf) if perf is not None else []

    this_week_share: list[dict] = []
    if apps is not None and not apps.empty and "createdAt" in apps.columns:
        source_col = "source.title" if "source.title" in apps.columns else None
        if source_col:
            now = pd.Timestamp.now(tz="UTC")
            week_ago = now - pd.Timedelta(days=7)
            created = _ts(apps["createdAt"])
            recent = apps[(created >= week_ago) & (~apps[source_col].isin(["Kula_Migrated", "Migrated_Kula", "Unspecified"]))].copy()
            if not recent.empty:
                grouped = recent.groupby(source_col).size().reset_index(name="count").rename(columns={source_col: "source"})
                this_week_share = to_records(grouped.sort_values("count", ascending=False))

    return envelope(
        {"table": table, "thisWeekShare": this_week_share},
        last_sync_at=registry.snapshot().get("loadedAt"),
    )
