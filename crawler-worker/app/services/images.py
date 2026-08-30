import hashlib
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin

import httpx
import imagehash
from PIL import Image

from ..models import ImageRecord
from ..security import validate_public_image_url


async def download_and_dedupe(urls: list[str], output_dir: Path, limit: int = 40) -> tuple[list[ImageRecord], list[str]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    records: list[ImageRecord] = []
    warnings: list[str] = []
    sha_seen: set[str] = set()
    phashes: list[imagehash.ImageHash] = []
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        for url in urls:
            if len(records) >= limit:
                break
            try:
                validate_public_image_url(url)
                current_url = url
                for _ in range(4):
                    validate_public_image_url(current_url)
                    response = await client.get(current_url, headers={"User-Agent": "LeshanMarketCrawler/1.0"})
                    if response.is_redirect:
                        current_url = urljoin(current_url, response.headers["location"])
                        continue
                    break
                else:
                    raise ValueError("too many image redirects")
                response.raise_for_status()
                if len(response.content) > 20 * 1024 * 1024:
                    raise ValueError("image exceeds 20 MB")
                image = Image.open(BytesIO(response.content))
                image.load()
                width, height = image.size
                if width < 300 or height < 200 or max(width / height, height / width) > 4.5:
                    continue
                sha = hashlib.sha256(response.content).hexdigest()
                if sha in sha_seen:
                    continue
                perceptual = imagehash.phash(image)
                if any(perceptual - prior <= 2 for prior in phashes):
                    continue
                suffix = ".png" if image.format == "PNG" else ".webp" if image.format == "WEBP" else ".jpg"
                path = output_dir / f"{len(records) + 1:03d}{suffix}"
                path.write_bytes(response.content)
                sha_seen.add(sha)
                phashes.append(perceptual)
                records.append(ImageRecord(
                    source_url=url,
                    order=len(records) + 1,
                    width=width,
                    height=height,
                    is_cover=len(records) == 0,
                    sha256=sha,
                    phash=str(perceptual),
                    local_path=str(path),
                    captured_at=datetime.now(timezone.utc).isoformat(),
                ))
            except Exception as error:
                warnings.append(f"image skipped: {type(error).__name__}")
    return records, warnings[:10]
