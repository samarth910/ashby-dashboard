"""Atomic CSV + parquet read/write. The ONLY module that touches cache files.

Write contract: write to `<path>.tmp`, fsync, rename. POSIX atomic rename means
a crash can leave either the old file or the new file on disk, never a torn one.
Tmp sits in the same directory as the target so rename is same-filesystem (atomic).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Literal

import pandas as pd

from app.config import settings


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_dataframe(path: Path, df: pd.DataFrame, fmt: Literal["csv", "parquet"]) -> None:
    """Atomic write of a DataFrame to CSV or parquet."""
    path = Path(path)
    _ensure_parent(path)
    tmp = path.with_suffix(path.suffix + ".tmp")
    if fmt == "csv":
        df.to_csv(tmp, index=False)
    elif fmt == "parquet":
        df.to_parquet(tmp, index=False)
    else:
        raise ValueError(f"unknown format: {fmt}")
    with open(tmp, "rb") as f:
        os.fsync(f.fileno())
    os.replace(tmp, path)


def entity_paths(entity_name: str, data_dir: Path | None = None) -> tuple[Path, Path]:
    base = Path(data_dir or settings.data_dir)
    return base / "parquet" / f"{entity_name}.parquet", base / "raw" / f"{entity_name}.csv"


def write_entity(entity_name: str, df: pd.DataFrame, data_dir: Path | None = None) -> None:
    """Write parquet (hot path) and CSV (debug) snapshots atomically. Parquet first."""
    parquet_path, csv_path = entity_paths(entity_name, data_dir)
    write_dataframe(parquet_path, df, "parquet")
    write_dataframe(csv_path, df, "csv")


def load_entity(entity_name: str, data_dir: Path | None = None) -> pd.DataFrame | None:
    parquet_path, _ = entity_paths(entity_name, data_dir)
    if not parquet_path.exists():
        return None
    return pd.read_parquet(parquet_path)


def sync_state_path(data_dir: Path | None = None) -> Path:
    return Path(data_dir or settings.data_dir) / "sync_state.json"


def read_sync_state(data_dir: Path | None = None) -> dict[str, Any]:
    p = sync_state_path(data_dir)
    if not p.exists():
        return {"version": 1, "entities": {}}
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def write_sync_state(state: dict[str, Any], data_dir: Path | None = None) -> None:
    p = sync_state_path(data_dir)
    _ensure_parent(p)
    tmp = p.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, p)
