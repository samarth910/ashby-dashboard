"""Async Ashby API client.

- HTTP Basic: api_key as username, empty password.
- RPC over POST. Format: POST /{category}.{method}, JSON body.
- Bounded concurrency via asyncio.Semaphore (org-wide, shared across all entities).
- 429 / 5xx: exponential backoff 1s, 2s, 4s, 8s; respects Retry-After.
- Network error: 2 short-linear retries.
- syncTokenExpired responses raise AshbyTokenExpired so the runner can downgrade
  that entity to a full fetch without failing the whole run.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class AshbyError(Exception):
    pass


class AshbyTokenExpired(AshbyError):
    pass


class AshbyClient:
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        max_concurrency: int = 4,
        timeout: float = 60.0,
    ) -> None:
        self.api_key = api_key or settings.ashby_api_key
        if not self.api_key:
            raise ValueError("ASHBY_API_KEY is not set")
        self.base_url = (base_url or settings.ashby_base_url).rstrip("/")
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            auth=(self.api_key, ""),
            timeout=timeout,
            headers={"Accept": "application/json"},
        )
        self._sem = asyncio.Semaphore(max_concurrency)

    async def __aenter__(self) -> "AshbyClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._client.aclose()

    async def call(self, endpoint: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        """POST /{endpoint} with JSON body. Returns parsed JSON. Raises on exhausted retries."""
        body = body or {}
        path = f"/{endpoint}"
        max_attempts = 4
        last_exc: Exception | None = None

        for attempt in range(max_attempts):
            try:
                async with self._sem:
                    r = await self._client.post(path, json=body)
            except (httpx.TransportError, httpx.TimeoutException) as e:
                last_exc = e
                if attempt < 2:  # 2 short-linear retries on network errors
                    await asyncio.sleep(0.5)
                    continue
                raise AshbyError(f"network error on {endpoint}: {e}") from e

            if r.status_code == 429:
                retry_after = _retry_after_seconds(r) or (2**attempt)
                logger.warning(
                    "429 on %s; sleeping %.1fs (attempt %d/%d)",
                    endpoint, retry_after, attempt + 1, max_attempts,
                )
                await asyncio.sleep(retry_after)
                last_exc = AshbyError(f"429 on {endpoint}")
                continue

            if 500 <= r.status_code < 600:
                backoff = 2**attempt
                logger.warning(
                    "%d on %s; sleeping %.1fs (attempt %d/%d)",
                    r.status_code, endpoint, backoff, attempt + 1, max_attempts,
                )
                await asyncio.sleep(backoff)
                last_exc = AshbyError(f"{r.status_code} on {endpoint}")
                continue

            if r.status_code >= 400:
                raise AshbyError(f"{r.status_code} on {endpoint}: {r.text[:400]}")

            data = r.json()
            if data.get("success") is False:
                errors = data.get("errors") or []
                err_str = " ".join(str(e) for e in errors).lower()
                if "synctoken" in err_str and ("expired" in err_str or "invalid" in err_str):
                    raise AshbyTokenExpired(f"syncToken expired on {endpoint}: {errors}")
                raise AshbyError(f"ashby error on {endpoint}: {errors}")
            return data

        raise AshbyError(f"exhausted retries on {endpoint}") from last_exc


def _retry_after_seconds(r: httpx.Response) -> float | None:
    raw = r.headers.get("retry-after")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


async def verify_key(client: AshbyClient) -> dict[str, Any]:
    return await client.call("apiKey.info")
