"""Helpers shared across dashboard endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd


def to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """DataFrame -> JSON-safe list of dicts (NaN -> None, Timestamp -> iso)."""
    if df.empty:
        return []
    clean = df.replace({np.nan: None}).copy()
    for col in clean.columns:
        if pd.api.types.is_datetime64_any_dtype(clean[col]):
            clean[col] = clean[col].dt.strftime("%Y-%m-%dT%H:%M:%S%z").fillna("")
    return clean.to_dict(orient="records")


def envelope(data: Any, last_sync_at: str | None = None) -> dict[str, Any]:
    return {
        "data": data,
        "lastSyncAt": last_sync_at,
        "source": "cache",
        "servedAt": datetime.now(timezone.utc).isoformat(),
    }
