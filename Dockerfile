# Multi-stage build: frontend dist -> FastAPI static mount.
# Final image runs one process (uvicorn) serving both /api/* and the SPA.

# ---------- frontend ----------
FROM node:22-alpine AS fe
WORKDIR /app/frontend
RUN corepack enable && corepack prepare pnpm@10.33.1 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY frontend/ ./
RUN pnpm build

# ---------- backend ----------
FROM python:3.12-slim AS be
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_LINK_MODE=copy
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv
WORKDIR /app
COPY backend/pyproject.toml ./backend/pyproject.toml
RUN cd backend && uv sync --no-dev --no-install-project
COPY backend/ ./backend/
RUN cd backend && uv sync --no-dev
COPY --from=fe /app/frontend/dist ./frontend/dist

# persistent volume is mounted at /app/data by Railway
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
EXPOSE 8000
WORKDIR /app/backend
CMD ["sh", "-c", "uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
