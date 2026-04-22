from fastapi import FastAPI

from app.api import health
from app.security import IPAllowlistMiddleware


def create_app() -> FastAPI:
    app = FastAPI(title="Sarvam Hiring Dashboard", version="0.1.0")
    app.add_middleware(IPAllowlistMiddleware)
    app.include_router(health.router)
    return app


app = create_app()
