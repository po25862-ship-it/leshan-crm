import argparse
import asyncio
import json
import os
import re
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

from .payload import decrypt_payload
from .services.pipeline import run_pipeline


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_doc_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(value or "unknown"))[:180]


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


async def execute(url: str, crm_property_id: str, requested_by_uid: str, request_id: str) -> None:
    database = initialize_firestore()
    property_ref = database.collection("properties").document(crm_property_id)
    property_snapshot = property_ref.get()
    if not property_snapshot.exists:
        raise RuntimeError("CRM property does not exist")
    if property_snapshot.to_dict().get("marketCrawl", {}).get("requestId") != request_id:
        raise RuntimeError("This crawl request is no longer current")

    property_ref.update({
        "marketCrawl.status": "running",
        "marketCrawl.startedAt": firestore.SERVER_TIMESTAMP,
        "marketCrawl.error": firestore.DELETE_FIELD,
    })

    try:
        result = await run_pipeline(url)
        source = safe_doc_id(result.source)
        source_property_id = safe_doc_id(result.source_property_id)
        listing_id = f"{source}_{source_property_id}"
        listing_ref = property_ref.collection("marketListings").document(listing_id)
        existing_photos = list(property_ref.collection("marketPhotos").where("listingId", "==", listing_id).stream())

        batch = database.batch()
        for photo in existing_photos:
            batch.delete(photo.reference)
        batch.set(listing_ref, {
            **result.property,
            "listingId": listing_id,
            "source": result.source,
            "sourcePropertyId": result.source_property_id,
            "sourceUrl": result.property.get("source_url", url),
            "warnings": result.warnings,
            "imageCount": len(result.images),
            "lastCrawledAt": result.property.get("crawl_time", now_iso()),
            "updatedAt": firestore.SERVER_TIMESTAMP,
            "updatedByUid": requested_by_uid,
        }, merge=True)

        for index, image in enumerate(result.images[:100]):
            data = image.model_dump(exclude={"local_path"})
            photo_id = safe_doc_id(data.get("drive_file_id") or data.get("sha256") or f"{listing_id}_{index + 1}")
            batch.set(property_ref.collection("marketPhotos").document(photo_id), {
                **data,
                "listingId": listing_id,
                "source": result.source,
                "sourcePropertyId": result.source_property_id,
                "publicAdAllowed": False,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            })

        batch.update(property_ref, {
            "marketLastCrawledAt": firestore.SERVER_TIMESTAMP,
            "marketLastSource": result.source,
            "marketLastSourcePropertyId": result.source_property_id,
            "marketCrawl.status": "completed",
            "marketCrawl.finishedAt": firestore.SERVER_TIMESTAMP,
            "marketCrawl.sourcePropertyId": result.source_property_id,
            "marketCrawl.photoCount": len(result.images),
            "marketCrawl.error": firestore.DELETE_FIELD,
        })
        batch.commit()
    except Exception as error:
        property_ref.update({
            "marketCrawl.status": "failed",
            "marketCrawl.finishedAt": firestore.SERVER_TIMESTAMP,
            "marketCrawl.error": str(error)[:500],
        })
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Run one Leshan market crawl GitHub Actions job")
    parser.add_argument("--payload", required=True)
    args = parser.parse_args()
    payload = decrypt_payload(args.payload)
    asyncio.run(execute(
        payload["url"],
        payload["crm_property_id"],
        payload["requested_by_uid"],
        payload["request_id"],
    ))


if __name__ == "__main__":
    main()
