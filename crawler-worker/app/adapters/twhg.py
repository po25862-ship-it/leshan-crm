import json
import re
from datetime import datetime, timezone
from html import unescape
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup


IMAGE_KEYS = {"image", "images", "imageurl", "image_url", "photo", "photos", "pic", "pics"}
BLOCKED_IMAGE_WORDS = ("logo", "icon", "sprite", "avatar", "banner", "qrcode", "qr-code", "map")


def source_property_id(url: str) -> str:
    match = re.search(r"/buy/([A-Za-z0-9_-]+)", urlparse(url).path)
    if not match:
        raise ValueError("Taiwan Housing property id not found")
    return match.group(1)


def choose_cover_image(images: list[str], property_id: str) -> str | None:
    """Pick the first official listing image, preferring a filename keyed by listing number."""
    normalized_id = str(property_id or "").strip().upper()
    official: list[str] = []
    for image in images:
        parsed = urlparse(str(image or ""))
        host = (parsed.hostname or "").lower()
        path = parsed.path or ""
        if parsed.scheme != "https" or not (host == "twhg.com.tw" or host.endswith(".twhg.com.tw")):
            continue
        if not re.search(r"\.(?:jpe?g|png|webp)$", path, re.I):
            continue
        official.append(image)
        filename = path.rsplit("/", 1)[-1].upper()
        if normalized_id and filename.startswith(normalized_id):
            return image
    return official[0] if official and not normalized_id else None


def _number(text: str) -> float | None:
    match = re.search(r"([\d,.]+)", text.replace("，", ","))
    return float(match.group(1).replace(",", "")) if match else None


def _price(text: str) -> int | None:
    match = re.search(r"([\d,.]+)\s*萬", text)
    return round(float(match.group(1).replace(",", "")) * 10000) if match else None


def _label_value(text: str, labels: tuple[str, ...]) -> str | None:
    labels_pattern = "|".join(map(re.escape, labels))
    match = re.search(rf"(?:{labels_pattern})\s*[：:]?\s*([^\n|｜]{{1,40}})", text)
    return match.group(1).strip() if match else None


def _walk_images(value, output: list[str]) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in IMAGE_KEYS:
                _walk_images(child, output)
            elif isinstance(child, (dict, list)):
                _walk_images(child, output)
    elif isinstance(value, list):
        for child in value:
            _walk_images(child, output)
    elif isinstance(value, str) and re.search(r"https?://[^\s\"']+\.(?:jpe?g|png|webp)(?:\?[^\s\"']*)?$", value, re.I):
        output.append(unescape(value.replace("\\/", "/")))


def parse(html: str, url: str) -> tuple[dict, list[str]]:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text("\n", strip=True)
    property_id = source_property_id(url)
    title = ""
    og_title = soup.select_one('meta[property="og:title"]')
    if og_title:
        title = og_title.get("content", "").strip()
    if not title and soup.title:
        title = soup.title.get_text(strip=True)

    images: list[str] = []
    for tag in soup.select("img, picture source"):
        candidates = [
            tag.get("src"), tag.get("data-src"), tag.get("data-original"),
            tag.get("data-lazy-src"), tag.get("data-image"),
        ]
        srcset = tag.get("srcset") or tag.get("data-srcset")
        if srcset:
            candidates.extend(part.strip().split(" ")[0] for part in srcset.split(","))
        for candidate in candidates:
            if candidate:
                images.append(urljoin(url, candidate))

    for script in soup.select('script[type="application/ld+json"], script[type="application/json"]'):
        try:
            _walk_images(json.loads(script.string or ""), images)
        except (json.JSONDecodeError, TypeError):
            pass
    for match in re.findall(r'https?:\\?/\\?/[^\s"\']+?\.(?:jpe?g|png|webp)(?:\?[^\s"\']*)?', html, re.I):
        images.append(unescape(match.replace("\\/", "/")))

    deduped = []
    seen = set()
    for image in images:
        normalized = image.split("#", 1)[0]
        lowered = normalized.lower()
        if normalized in seen or any(word in lowered for word in BLOCKED_IMAGE_WORDS):
            continue
        seen.add(normalized)
        deduped.append(normalized)

    layout = _label_value(text, ("格局",))
    floor_text = _label_value(text, ("樓層", "樓別"))
    floor_match = re.search(r"(-?\d+)\s*(?:樓|F)?\s*[/／]\s*(\d+)\s*(?:樓|F)?", floor_text or "")
    property_data = {
        "title": title,
        "price": _price(text),
        "community": _label_value(text, ("社區", "社區名稱")),
        "address": _label_value(text, ("地址", "路段")),
        "building_area": _number(_label_value(text, ("建坪", "權狀坪數", "總坪數")) or ""),
        "main_area": _number(_label_value(text, ("主建物",)) or ""),
        "balcony_area": _number(_label_value(text, ("附屬建物", "陽台")) or ""),
        "parking_area": _number(_label_value(text, ("車位坪數",)) or ""),
        "land_area": _number(_label_value(text, ("地坪", "土地坪數")) or ""),
        "layout": layout,
        "floor": int(floor_match.group(1)) if floor_match else None,
        "total_floor": int(floor_match.group(2)) if floor_match else None,
        "parking_type": _label_value(text, ("車位", "車位類型")),
        "management_fee": _number(_label_value(text, ("管理費",)) or ""),
        "source_url": url,
        "source_property_id": property_id,
        "crawl_time": datetime.now(timezone.utc).isoformat(),
    }
    if layout:
        nums = re.findall(r"\d+", layout)
        property_data.update({
            "bedrooms": int(nums[0]) if len(nums) > 0 else None,
            "living_rooms": int(nums[1]) if len(nums) > 1 else None,
            "bathrooms": int(nums[2]) if len(nums) > 2 else None,
        })
    return property_data, deduped
