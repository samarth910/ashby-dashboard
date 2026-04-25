"""Generic cursor + syncToken pagination over Ashby's .list endpoints.

Shape of every paginated response:
    {"success": true,
     "results": [...],
     "moreDataAvailable": bool,
     "nextCursor": "...",
     "syncToken": "..."   # present on last page when requested}

On incremental calls, we send the saved syncToken on the FIRST page only; the
cursor chain takes over after that. The final page's syncToken (if any) is what
we persist for next run.
"""

from __future__ import annotations

from typing import Any, AsyncIterator

from app.ashby.client import AshbyClient


PageCallback = "Callable[[int, int], None]"  # (pages_done, running_total_rows)


async def paginate(
    client: AshbyClient,
    endpoint: str,
    *,
    extra_body: dict[str, Any] | None = None,
    limit: int = 100,
    sync_token: str | None = None,
) -> AsyncIterator[dict[str, Any]]:
    body: dict[str, Any] = dict(extra_body or {})
    body["limit"] = limit
    if sync_token:
        body["syncToken"] = sync_token

    cursor: str | None = None
    while True:
        if cursor:
            body["cursor"] = cursor
            body.pop("syncToken", None)  # only on the first page
        resp = await client.call(endpoint, body)
        yield resp

        if not resp.get("moreDataAvailable"):
            return
        cursor = resp.get("nextCursor")
        if not cursor:
            return


async def fetch_all(
    client: AshbyClient,
    endpoint: str,
    *,
    extra_body: dict[str, Any] | None = None,
    limit: int = 100,
    sync_token: str | None = None,
    on_page: PageCallback | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Walk every page. Returns (rows, final_sync_token_or_None).

    `on_page(pages_done, running_total)` fires after each page so callers can
    surface progress to the UI for long-paginated entities."""
    rows: list[dict[str, Any]] = []
    final_token: str | None = None
    pages = 0
    async for page in paginate(
        client, endpoint, extra_body=extra_body, limit=limit, sync_token=sync_token
    ):
        pages += 1
        rows.extend(page.get("results") or [])
        if page.get("syncToken"):
            final_token = page["syncToken"]
        if on_page is not None:
            try:
                on_page(pages, len(rows))
            except Exception:  # never let UI hooks break the sync
                pass
    return rows, final_token
