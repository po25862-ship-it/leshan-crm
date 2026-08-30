import json
from pathlib import Path

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig

from ..adapters.twhg import parse, source_property_id
from ..config import settings
from ..models import PipelineResponse
from ..security import validate_property_url
from .drive import upload_property_images
from .images import download_and_dedupe


async def run_pipeline(url: str) -> PipelineResponse:
    validate_property_url(url)
    source_id = source_property_id(url)
    browser_config = BrowserConfig(browser_type="chromium", headless=True)
    run_config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        scan_full_page=True,
        scroll_delay=0.5,
        wait_until="domcontentloaded",
        page_timeout=60000,
        delay_before_return_html=1.0,
    )
    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun(url=url, config=run_config)
    if not result.success:
        raise RuntimeError(result.error_message or "crawl failed")

    property_data, image_urls = parse(result.html or result.cleaned_html or "", url)
    raw_dir = settings.crawler_work_root / source_id / "raw"
    images, warnings = await download_and_dedupe(image_urls, raw_dir, settings.max_images)
    if not images:
        warnings.append("No valid property images were downloaded")
    if settings.drive_ready:
        images = await upload_property_images(source_id, "twhg", images)
    elif settings.allow_pipeline_without_drive:
        warnings.append("Google Drive is not configured; drive_file_id was not created")
    else:
        raise RuntimeError("Google Drive OAuth is not configured")

    manifest = {
        "source": "twhg",
        "source_property_id": source_id,
        "property": property_data,
        "images": [image.model_dump() for image in images],
        "warnings": warnings,
    }
    manifest_path = settings.crawler_work_root / source_id / "drive_upload_manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return PipelineResponse(**manifest)
