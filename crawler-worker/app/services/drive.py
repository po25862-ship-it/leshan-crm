import json
import mimetypes
from pathlib import Path
from urllib.parse import quote

import httpx

from ..config import settings
from ..models import ImageRecord


DRIVE_API = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
FOLDER_MIME = "application/vnd.google-apps.folder"


class DriveClient:
    def __init__(self) -> None:
        self._access_token = ""

    async def access_token(self) -> str:
        if self._access_token:
            return self._access_token
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post("https://oauth2.googleapis.com/token", data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": settings.google_refresh_token,
                "grant_type": "refresh_token",
            })
            response.raise_for_status()
            self._access_token = response.json()["access_token"]
            return self._access_token

    async def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {await self.access_token()}"}

    async def find_folder(self, parent_id: str, name: str, prefix: bool = False) -> str | None:
        operator = "contains" if prefix else "="
        safe = name.replace("'", "\\'")
        query = f"'{parent_id}' in parents and trashed = false and mimeType = '{FOLDER_MIME}' and name {operator} '{safe}'"
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{DRIVE_API}/files", params={
                "q": query, "fields": "files(id,name)", "pageSize": 10,
            }, headers=await self._headers())
            response.raise_for_status()
            files = response.json().get("files", [])
            return files[0]["id"] if files else None

    async def ensure_folder(self, parent_id: str, name: str, prefix: bool = False) -> str:
        existing = await self.find_folder(parent_id, name, prefix=prefix)
        if existing:
            return existing
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f"{DRIVE_API}/files", headers=await self._headers(), json={
                "name": name, "mimeType": FOLDER_MIME, "parents": [parent_id],
            })
            response.raise_for_status()
            return response.json()["id"]

    async def find_by_logical_key(self, folder_id: str, logical_key: str) -> dict | None:
        safe = logical_key.replace("'", "\\'")
        query = f"'{folder_id}' in parents and trashed = false and appProperties has {{ key='logicalKey' and value='{safe}' }}"
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(f"{DRIVE_API}/files", params={
                "q": query, "fields": "files(id,webViewLink)", "pageSize": 1,
            }, headers=await self._headers())
            response.raise_for_status()
            files = response.json().get("files", [])
            return files[0] if files else None

    async def upload(self, path: Path, folder_id: str, logical_key: str) -> dict:
        existing = await self.find_by_logical_key(folder_id, logical_key)
        if existing:
            return existing
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        metadata = {"name": path.name, "parents": [folder_id], "appProperties": {"logicalKey": logical_key}}
        files = {
            "metadata": (None, json.dumps(metadata), "application/json; charset=UTF-8"),
            "file": (path.name, path.read_bytes(), mime),
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(f"{DRIVE_UPLOAD_API}/files", params={
                "uploadType": "multipart", "fields": "id,webViewLink",
            }, headers=await self._headers(), files=files)
            response.raise_for_status()
            return response.json()

    async def download(self, file_id: str) -> httpx.Response:
        client = httpx.AsyncClient(timeout=30, follow_redirects=True)
        response = await client.get(f"{DRIVE_API}/files/{quote(file_id)}", params={"alt": "media"}, headers=await self._headers())
        await client.aclose()
        return response


async def upload_property_images(source_property_id: str, source: str, images: list[ImageRecord]) -> list[ImageRecord]:
    client = DriveClient()
    properties = await client.ensure_folder(settings.google_drive_root_folder_id, "Properties")
    property_folder = await client.ensure_folder(properties, source_property_id, prefix=True)
    source_folder = await client.ensure_folder(property_folder, "source")
    source_target = await client.ensure_folder(source_folder, source)
    selected_target = await client.ensure_folder(property_folder, "selected")

    for image in images:
        path = Path(image.local_path or "")
        logical_key = f"{source}:{source_property_id}:{image.sha256}"
        uploaded = await client.upload(path, source_target, logical_key)
        image.drive_file_id = uploaded["id"]
        image.drive_folder_id = source_target
        if image.order <= settings.selected_images:
            selected_key = f"selected:{logical_key}"
            await client.upload(path, selected_target, selected_key)
    return images
