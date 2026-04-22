from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ashby_api_key: str = ""
    ashby_base_url: str = "https://api.ashbyhq.com"
    data_dir: Path = Path("./data")
    sync_interval_hours: int = 6
    allowed_ips: str = ""
    app_port: int = 8000
    app_log_level: str = "info"

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def allowed_ip_list(self) -> list[str]:
        return [ip.strip() for ip in self.allowed_ips.split(",") if ip.strip()]


settings = Settings()
