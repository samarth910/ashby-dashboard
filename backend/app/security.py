from fastapi import Request
from fastapi.responses import PlainTextResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


class IPAllowlistMiddleware(BaseHTTPMiddleware):
    """Block requests whose client IP is not in ALLOWED_IPS. Empty allowlist = open."""

    async def dispatch(self, request: Request, call_next):
        allow = settings.allowed_ip_list
        if not allow:
            return await call_next(request)

        fwd = request.headers.get("x-forwarded-for", "")
        client_ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "")
        if client_ip not in allow:
            return PlainTextResponse("forbidden", status_code=403)
        return await call_next(request)
