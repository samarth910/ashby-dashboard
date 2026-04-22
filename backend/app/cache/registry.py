"""In-memory registry of DataFrames + derived tables used by the API layer.

Hot path:
    df = registry.get("applications")     # returns a snapshot reference

Swap path (called after a successful sync):
    registry.reload_from_disk()           # rebuilds everything under an RLock

Readers get a consistent snapshot because the registry only swaps whole dicts
under the lock. Individual DataFrames are never mutated in place.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

import pandas as pd

from app.ashby.entities import ENTITIES
from app.cache import store
from app.cache.derived import compute_all as compute_derived

logger = logging.getLogger(__name__)


class Registry:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._entities: dict[str, pd.DataFrame] = {}
        self._derived: dict[str, pd.DataFrame] = {}
        self._loaded_at: str | None = None

    def get(self, name: str) -> pd.DataFrame | None:
        with self._lock:
            return self._entities.get(name)

    def derived(self, name: str) -> pd.DataFrame | None:
        with self._lock:
            return self._derived.get(name)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return {
                "loadedAt": self._loaded_at,
                "entities": {k: int(len(v)) for k, v in self._entities.items()},
                "derived": {k: int(len(v)) for k, v in self._derived.items()},
            }

    def reload_from_disk(self) -> dict[str, int]:
        """Load every entity parquet from disk, recompute derived, swap under lock."""
        from datetime import datetime, timezone

        new_entities: dict[str, pd.DataFrame] = {}
        for e in ENTITIES:
            df = store.load_entity(e.name)
            if df is not None:
                new_entities[e.name] = df

        try:
            new_derived = compute_derived(new_entities)
        except Exception:
            logger.exception("derived table computation failed; keeping previous")
            new_derived = dict(self._derived)  # fall back to previous

        with self._lock:
            self._entities = new_entities
            self._derived = new_derived
            self._loaded_at = datetime.now(timezone.utc).isoformat()
        counts = {k: len(v) for k, v in new_entities.items()}
        logger.info("registry reloaded: %s", counts)
        return counts


registry = Registry()
