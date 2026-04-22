from datetime import datetime, timezone

from fastapi import APIRouter

from app.cache import store
from app.cache.registry import registry
from app.sync.service import refresh_service

router = APIRouter()


@router.get("/api/health")
def health() -> dict:
    sync_state = store.read_sync_state()
    current = refresh_service.current_job
    return {
        "status": "ok",
        "now": datetime.now(timezone.utc).isoformat(),
        "registry": registry.snapshot(),
        "sync": {
            "lastRunStartedAt": sync_state.get("lastRunStartedAt"),
            "lastRunCompletedAt": sync_state.get("lastRunCompletedAt"),
            "lastRunKind": sync_state.get("lastRunKind"),
            "lastRunDurationSec": sync_state.get("lastRunDurationSec"),
            "currentJobId": current.id if current else None,
            "entities": {
                name: {
                    "syncToken": entry.get("syncToken") is not None,
                    "rowCount": entry.get("rowCount"),
                    "lastFullSync": entry.get("lastFullSync"),
                    "lastIncrementalSync": entry.get("lastIncrementalSync"),
                    "lastError": entry.get("lastError"),
                }
                for name, entry in sync_state.get("entities", {}).items()
            },
        },
    }
