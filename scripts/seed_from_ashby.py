"""Full or incremental Ashby sync run from the CLI.

Usage:
    cd backend
    uv run python ../scripts/seed_from_ashby.py            # full sync
    uv run python ../scripts/seed_from_ashby.py --incremental

First full run against a 40k-candidate org takes 5-15 min. Subsequent
incremental runs should finish in well under 90s.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

# ensure backend/ is importable even when run from scripts/
_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from app.sync.runner import run_sync  # noqa: E402


async def _main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    full = "--incremental" not in sys.argv
    print(f"starting {'full' if full else 'incremental'} sync...")
    state = await run_sync(full=full)

    print("\n=== sync summary ===")
    errors = []
    for name, entry in state.get("entities", {}).items():
        row_count = entry.get("rowCount", "?")
        fetched = entry.get("fetchedThisRun", "?")
        dur = entry.get("durationSec", "?")
        kind = entry.get("lastRunKind", "?")
        err = entry.get("lastError")
        marker = " ERROR" if err else ""
        print(f"  {name:22s} {kind:22s} fetched={fetched:>6}  total={row_count:>6}  {dur}s{marker}")
        if err:
            errors.append(f"{name}: {err}")

    print(f"\ntotal wall: {state.get('lastRunDurationSec')}s")
    if errors:
        print("\nfailures:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(_main())
