"""Tests for cache.store: atomic write, round-trip, sync_state read/write."""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from app.cache import store


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path


def test_write_entity_roundtrip_parquet_and_csv(data_dir: Path) -> None:
    df = pd.DataFrame({"id": ["a", "b", "c"], "n": [1, 2, 3]})
    store.write_entity("widgets", df, data_dir=data_dir)

    parquet_path, csv_path = store.entity_paths("widgets", data_dir=data_dir)
    assert parquet_path.exists()
    assert csv_path.exists()

    loaded = store.load_entity("widgets", data_dir=data_dir)
    assert loaded is not None
    assert list(loaded["id"]) == ["a", "b", "c"]
    assert list(loaded["n"]) == [1, 2, 3]


def test_write_leaves_no_tmp_on_success(data_dir: Path) -> None:
    df = pd.DataFrame({"id": [1]})
    store.write_entity("widgets", df, data_dir=data_dir)
    parquet_path, csv_path = store.entity_paths("widgets", data_dir=data_dir)
    assert not parquet_path.with_suffix(parquet_path.suffix + ".tmp").exists()
    assert not csv_path.with_suffix(csv_path.suffix + ".tmp").exists()


def test_load_entity_returns_none_when_missing(data_dir: Path) -> None:
    assert store.load_entity("missing", data_dir=data_dir) is None


def test_sync_state_roundtrip(data_dir: Path) -> None:
    empty = store.read_sync_state(data_dir=data_dir)
    assert empty == {"version": 1, "entities": {}}

    state = {
        "version": 1,
        "lastRunKind": "full",
        "entities": {"jobs": {"syncToken": "abc", "rowCount": 42}},
    }
    store.write_sync_state(state, data_dir=data_dir)
    got = store.read_sync_state(data_dir=data_dir)
    assert got == state


def test_atomic_write_overwrites_existing(data_dir: Path) -> None:
    df1 = pd.DataFrame({"id": [1]})
    store.write_entity("widgets", df1, data_dir=data_dir)
    df2 = pd.DataFrame({"id": [1, 2]})
    store.write_entity("widgets", df2, data_dir=data_dir)
    loaded = store.load_entity("widgets", data_dir=data_dir)
    assert loaded is not None
    assert list(loaded["id"]) == [1, 2]
