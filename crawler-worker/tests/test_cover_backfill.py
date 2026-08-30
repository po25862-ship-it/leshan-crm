from app.adapters.twhg import choose_cover_image
from app.backfill_covers import needs_cover


def test_choose_cover_prefers_listing_number():
    images = [
        "https://img2.twhg.com.tw/nhapp/pda/resource/330133007.jpg",
        "https://img2.twhg.com.tw/nhapp/images/OB01/DE026014050120260827175855.jpg",
    ]
    assert choose_cover_image(images, "DE02601405") == images[1]


def test_choose_cover_rejects_non_twhg_images():
    assert choose_cover_image(["https://example.com/DE0260140501.jpg"], "DE02601405") is None


def test_needs_cover_preserves_direct_images():
    assert needs_cover({"websiteUrl": "https://www.twhg.com.tw/buy/DE02601405"})
    assert needs_cover({"sheetFiles": [{"type": "image/jpeg", "url": "https://example.test/sheet.jpg"}]})
    assert not needs_cover({"imageUrl": "https://example.test/manual.jpg"})
    assert not needs_cover({"coverImageUrl": "https://img2.twhg.com.tw/cover.jpg"})
