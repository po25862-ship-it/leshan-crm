from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    crawler_internal_token: str = ""
    crawler_work_root: Path = Path("/data/leshan-market")
    google_client_id: str = ""
    google_client_secret: str = ""
    google_refresh_token: str = ""
    google_drive_root_folder_id: str = ""
    allow_pipeline_without_drive: bool = False
    max_images: int = 40
    selected_images: int = 5

    @property
    def drive_ready(self) -> bool:
        return all(
            (
                self.google_client_id,
                self.google_client_secret,
                self.google_refresh_token,
            )
        )


settings = Settings()
