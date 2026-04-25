from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# repo root so .env resolves regardless of cwd
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    ashby_api_key: str = ""
    ashby_base_url: str = "https://api.ashbyhq.com"
    data_dir: Path = REPO_ROOT / "data"
    sync_interval_hours: int = 4
    allowed_ips: str = ""
    app_port: int = 8000
    app_log_level: str = "info"

    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def allowed_ip_list(self) -> list[str]:
        return [ip.strip() for ip in self.allowed_ips.split(",") if ip.strip()]


def _resolve_data_dir(s: "Settings") -> Path:
    """Anchor a relative DATA_DIR to the repo root so cwd doesn't matter."""
    p = Path(s.data_dir)
    if not p.is_absolute():
        p = (REPO_ROOT / p).resolve()
    return p


settings = Settings()
settings.data_dir = _resolve_data_dir(settings)
