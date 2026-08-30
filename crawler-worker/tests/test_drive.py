import asyncio

from app.config import Settings, settings
from app.services.drive import DriveClient, upload_property_images


def test_drive_is_ready_without_a_precreated_root_folder():
    configured = Settings(
        _env_file=None,
        google_client_id="client-id",
        google_client_secret="client-secret",
        google_refresh_token="refresh-token",
        google_drive_root_folder_id="",
    )
    assert configured.drive_ready


def test_upload_creates_private_app_root_when_folder_id_is_missing(monkeypatch):
    calls = []

    async def fake_ensure_folder(self, parent_id, name, prefix=False):
        calls.append((parent_id, name, prefix))
        return f"folder-{len(calls)}"

    monkeypatch.setattr(settings, "google_drive_root_folder_id", "")
    monkeypatch.setattr(DriveClient, "ensure_folder", fake_ensure_folder)

    assert asyncio.run(upload_property_images("DE02505039", "twhg", [])) == []
    assert calls[0] == ("root", "Leshan Market Crawler", False)
    assert calls[1] == ("folder-1", "Properties", False)
