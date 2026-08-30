import argparse
import asyncio
import json
import os
from dataclasses import dataclass
from urllib.parse import urlparse

import firebase_admin
import httpx
from firebase_admin import credentials, firestore

from .adapters.twhg import choose_cover_image, parse, source_property_id


DIRECT_IMAGE_FIELDS = ("imageUrl", "photoUrl", "coverImageUrl")
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Safari/537.36"
)
ALLOWED_HOSTS = {"twhg.com.tw", "www.twhg.com.tw"}


@dataclass
class CoverCandidate:
    reference: object
    crm_property_id: str
    listing_no: str
    url: str


@dataclass
class CoverResult:
    candidate: CoverCandidate
    cover_url: str = ""
    error: str = ""


def initialize_firestore():
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON is not configured")
    service_account = json.loads(raw)
    if service_account.get("private_key"):
        service_account["private_key"] = service_account["private_key"].replace("\\n", "\n")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(service_account))
    return firestore.client()


def needs_cover(data: dict, force: bool = False) -> bool:
    if force:
        return not any(str(data.get(field) or "").strip() for field in ("imageUrl", "photoUrl"))
    return not any(str(data.get(field) or "").strip() for field in DIRECT_IMAGE_FIELDS)


def validate_twhg_url(value: str) -> str:
    parsed = urlparse(value)
    if len(value) > 2048 or parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("unsupported property URL")
    if not parsed.path.startswith("/buy/"):
        raise ValueError("unsupported property URL")
    return value


def collect_candidates(database, force: bool = False, limit: int = 0) -> tuple[list[CoverCandidate], int]:
    candidates: list[CoverCandidate] = []
    skipped_existing = 0
    for snapshot in database.collection("properties").stream():
        data = snapshot.to_dict() or {}
        if str(data.get("status") or "active") != "active":
            continue
        url = str(data.get("websiteUrl") or "").strip()
        if not url:
            continue
        if not needs_cover(data, force=force):
            skipped_existing += 1
            continue
        try:
            validate_twhg_url(url)
            listing_no = source_property_id(url)
        except ValueError:
            continue
        candidates.append(CoverCandidate(
            reference=snapshot.reference,
            crm_property_id=snapshot.id,
            listing_no=listing_no,
            url=url,
        ))
        if limit and len(candidates) >= limit:
            break
    return candidates, skipped_existing


async def fetch_cover(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    candidate: CoverCandidate,
    delay: float,
) -> CoverResult:
    async with semaphore:
        for attempt in range(4):
            try:
                response = await client.get(candidate.url)
                if response.status_code == 429:
                    retry_after = response.headers.get("retry-after", "")
                    wait = float(retry_after) if retry_after.isdigit() else 20.0 * (attempt + 1)
                    await asyncio.sleep(min(max(wait, 15.0), 120.0))
                    continue
                response.raise_for_status()
                _, images = parse(response.text, candidate.url)
                cover_url = choose_cover_image(images, candidate.listing_no)
                if not cover_url:
                    raise RuntimeError("official listing image not found")
                return CoverResult(candidate=candidate, cover_url=cover_url)
            except httpx.HTTPStatusError as error:
                return CoverResult(candidate=candidate, error=f"{type(error).__name__}: {error}"[:240])
            except Exception as error:
                if attempt == 3:
                    return CoverResult(candidate=candidate, error=f"{type(error).__name__}: {error}"[:240])
                await asyncio.sleep(3.0 * (attempt + 1))
            finally:
                await asyncio.sleep(max(0.0, delay))
        return CoverResult(candidate=candidate, error="rate limited after four attempts")


async def fetch_all(candidates: list[CoverCandidate], concurrency: int = 1, delay: float = 2.0) -> list[CoverResult]:
    semaphore = asyncio.Semaphore(max(1, concurrency))
    limits = httpx.Limits(max_connections=max(2, concurrency), max_keepalive_connections=max(2, concurrency))
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.5"}
    async with httpx.AsyncClient(timeout=35, follow_redirects=True, headers=headers, limits=limits) as client:
        return await asyncio.gather(*(fetch_cover(client, semaphore, candidate, delay) for candidate in candidates))


def write_results(database, results: list[CoverResult]) -> int:
    successful = [result for result in results if result.cover_url]
    for start in range(0, len(successful), 400):
        batch = database.batch()
        for result in successful[start:start + 400]:
            batch.set(result.candidate.reference, {
                "coverImageUrl": result.cover_url,
                "coverImageSource": "twhg",
                "coverImageListingNo": result.candidate.listing_no,
                "coverImageUpdatedAt": firestore.SERVER_TIMESTAMP,
            }, merge=True)
        batch.commit()
    return len(successful)


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill official first-image covers for CRM properties")
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    database = initialize_firestore()
    candidates, skipped_existing = collect_candidates(database, force=args.force, limit=max(0, args.limit))
    print(f"cover backfill candidates={len(candidates)} skipped_existing={skipped_existing}")
    if not candidates:
        return

    results = asyncio.run(fetch_all(
        candidates,
        concurrency=max(1, min(args.concurrency, 3)),
        delay=max(0.5, min(args.delay, 10.0)),
    ))
    updated = write_results(database, results)
    failures = [result for result in results if result.error]
    print(f"cover backfill updated={updated} failed={len(failures)}")
    for result in failures[:20]:
        print(f"cover skipped listing={result.candidate.listing_no} reason={result.error}")
    if updated == 0:
        raise RuntimeError("No property covers were updated")


if __name__ == "__main__":
    main()
