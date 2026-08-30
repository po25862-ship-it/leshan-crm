import pytest

from app.adapters.twhg import parse, source_property_id
from app.security import validate_property_url


TEST_URL = "https://www.twhg.com.tw/buy/DE02505039?agid=06459"


def test_source_property_id():
    assert source_property_id(TEST_URL) == "DE02505039"


def test_url_allowlist():
    assert validate_property_url(TEST_URL) == TEST_URL
    with pytest.raises(ValueError):
        validate_property_url("http://127.0.0.1/internal")
    with pytest.raises(ValueError):
        validate_property_url("https://example.com/buy/DE02505039")


def test_parser_uses_structured_data_and_keeps_order():
    html = """
    <html><head><meta property="og:title" content="鴻築金捷市"></head><body>
      <div>總價 1,488萬</div><div>建坪 33.94坪</div><div>格局 1/1/1</div><div>樓層 11/28樓</div>
      <img src="https://images.example.test/001.jpg">
      <img data-src="https://images.example.test/002.jpg">
      <script type="application/ld+json">{"image":["https://images.example.test/003.jpg"]}</script>
    </body></html>
    """
    property_data, images = parse(html, TEST_URL)
    assert property_data["title"] == "鴻築金捷市"
    assert property_data["price"] == 14_880_000
    assert property_data["building_area"] == 33.94
    assert property_data["floor"] == 11
    assert property_data["total_floor"] == 28
    assert images[:3] == [
        "https://images.example.test/001.jpg",
        "https://images.example.test/002.jpg",
        "https://images.example.test/003.jpg",
    ]
