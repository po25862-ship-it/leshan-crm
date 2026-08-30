import base64
import json
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def decrypt_payload(value: str) -> dict:
    key = base64.b64decode(os.environ.get("MARKET_JOB_ENCRYPTION_KEY", ""))
    if len(key) != 32:
        raise RuntimeError("MARKET_JOB_ENCRYPTION_KEY must decode to 32 bytes")
    padded = value + "=" * (-len(value) % 4)
    packed = base64.urlsafe_b64decode(padded)
    if len(packed) < 29:
        raise RuntimeError("Encrypted job payload is invalid")
    nonce, tag, ciphertext = packed[:12], packed[12:28], packed[28:]
    plaintext = AESGCM(key).decrypt(nonce, ciphertext + tag, None)
    payload = json.loads(plaintext)
    required = {"url", "crm_property_id", "requested_by_uid", "request_id"}
    if not required.issubset(payload):
        raise RuntimeError("Encrypted job payload is incomplete")
    return payload
