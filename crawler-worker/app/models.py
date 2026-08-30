from typing import Any

from pydantic import BaseModel, Field


class PipelineRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    crm_property_id: str = Field(min_length=1, max_length=128)


class ImageRecord(BaseModel):
    source_url: str
    order: int
    width: int | None = None
    height: int | None = None
    is_cover: bool = False
    sha256: str = ""
    phash: str = ""
    category: str = "other"
    local_path: str | None = None
    drive_file_id: str | None = None
    drive_folder_id: str | None = None
    captured_at: str


class PipelineResponse(BaseModel):
    success: bool = True
    source: str
    source_property_id: str
    property: dict[str, Any]
    images: list[ImageRecord]
    warnings: list[str] = Field(default_factory=list)
