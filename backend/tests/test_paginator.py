"""Tests for ashby.paginator using a fake AshbyClient."""

from __future__ import annotations

from typing import Any

import pytest

from app.ashby.paginator import fetch_all, paginate


class FakeClient:
    def __init__(self, pages: list[dict[str, Any]]) -> None:
        self._pages = list(pages)
        self.calls: list[dict[str, Any]] = []

    async def call(self, endpoint: str, body: dict[str, Any]) -> dict[str, Any]:
        self.calls.append({"endpoint": endpoint, "body": dict(body)})
        if not self._pages:
            return {"success": True, "results": [], "moreDataAvailable": False}
        return self._pages.pop(0)


@pytest.mark.asyncio
async def test_single_page() -> None:
    client = FakeClient([
        {"success": True, "results": [{"id": "a"}, {"id": "b"}], "moreDataAvailable": False},
    ])
    rows, token = await fetch_all(client, "foo.list")  # type: ignore[arg-type]
    assert [r["id"] for r in rows] == ["a", "b"]
    assert token is None
    assert len(client.calls) == 1


@pytest.mark.asyncio
async def test_multi_page_walks_cursor_and_returns_final_token() -> None:
    client = FakeClient([
        {"success": True, "results": [{"id": 1}], "moreDataAvailable": True, "nextCursor": "c1"},
        {"success": True, "results": [{"id": 2}], "moreDataAvailable": True, "nextCursor": "c2"},
        {"success": True, "results": [{"id": 3}], "moreDataAvailable": False, "syncToken": "TOKEN"},
    ])
    rows, token = await fetch_all(client, "foo.list")  # type: ignore[arg-type]
    assert [r["id"] for r in rows] == [1, 2, 3]
    assert token == "TOKEN"
    # cursor should be set on pages 2 and 3
    assert client.calls[0]["body"].get("cursor") is None
    assert client.calls[1]["body"]["cursor"] == "c1"
    assert client.calls[2]["body"]["cursor"] == "c2"


@pytest.mark.asyncio
async def test_sync_token_sent_only_on_first_page() -> None:
    client = FakeClient([
        {"success": True, "results": [], "moreDataAvailable": True, "nextCursor": "c1"},
        {"success": True, "results": [], "moreDataAvailable": False, "syncToken": "T2"},
    ])
    _, token = await fetch_all(client, "foo.list", sync_token="T1")  # type: ignore[arg-type]
    assert client.calls[0]["body"]["syncToken"] == "T1"
    assert "syncToken" not in client.calls[1]["body"]
    assert token == "T2"


@pytest.mark.asyncio
async def test_paginate_stops_when_no_cursor_even_if_more_available() -> None:
    client = FakeClient([
        {"success": True, "results": [{"id": 1}], "moreDataAvailable": True},  # no nextCursor
    ])
    pages: list[dict[str, Any]] = []
    async for p in paginate(client, "foo.list"):  # type: ignore[arg-type]
        pages.append(p)
    assert len(pages) == 1
