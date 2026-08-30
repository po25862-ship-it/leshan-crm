import re

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import Response

from .config import settings
from .models import PipelineRequest, PipelineResponse
from .security import require_internal_token
from .services.drive import DriveClient
from .services.pipeline import run_pipeline


app = FastAPI(title="Leshan Market Crawler", version="1.0.0", docs_url=None, redoc_url=None)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "driveConfigured": settings.drive_ready}


@app.post("/pipeline/property", response_model=PipelineResponse, dependencies=[Depends(require_internal_token)])
async def pipeline_property(request: PipelineRequest) -> PipelineResponse:
    try:
        return await run_pipeline(request.url)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/drive/files/{file_id}", dependencies=[Depends(require_internal_token)])
async def drive_file(file_id: str) -> Response:
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,200}", file_id):
        raise HTTPException(status_code=400, detail="invalid_file_id")
    if not settings.drive_ready:
        raise HTTPException(status_code=503, detail="drive_not_configured")
    upstream = await DriveClient().download(file_id)
    if upstream.status_code == 404:
        raise HTTPException(status_code=404, detail="file_not_found")
    if upstream.status_code != 200:
        raise HTTPException(status_code=502, detail="drive_download_failed")
    return Response(
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "application/octet-stream"),
        headers={"Cache-Control": "private, max-age=300"},
    )
