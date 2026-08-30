import hmac
import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import Header, HTTPException

from .config import settings


ALLOWED_PROPERTY_HOSTS = {"twhg.com.tw", "www.twhg.com.tw"}


def require_internal_token(x_leshan_internal_token: str = Header(default="")) -> None:
    if not settings.crawler_internal_token or not hmac.compare_digest(x_leshan_internal_token, settings.crawler_internal_token):
        raise HTTPException(status_code=401, detail="invalid_internal_token")


def validate_property_url(value: str) -> str:
    if len(value) > 2048:
        raise ValueError("URL is too long")
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_PROPERTY_HOSTS:
        raise ValueError("Only Taiwan Housing HTTPS property URLs are supported")
    if not parsed.path.startswith("/buy/"):
        raise ValueError("Unsupported Taiwan Housing URL")
    return value


def validate_public_image_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Unsupported image URL")
    default_port = 443 if parsed.scheme == "https" else 80
    for result in socket.getaddrinfo(parsed.hostname, parsed.port or default_port, type=socket.SOCK_STREAM):
        address = ipaddress.ip_address(result[4][0])
        if not address.is_global:
            raise ValueError("Image URL resolves to a non-public address")
    return value
