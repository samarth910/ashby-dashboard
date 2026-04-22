# Backend

FastAPI + httpx + pandas + APScheduler. Managed with `uv`.

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
# health probe
curl http://localhost:8000/api/health
```

See `../CLAUDE.md` for the architectural rules and `../docs/backend-architecture.md` for the deep dive.
