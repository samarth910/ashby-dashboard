from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "now": datetime.now(timezone.utc).isoformat(),
        "sync": {"state": "not_started"},
    }
