import base64
import json

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.payload import decrypt_payload


def test_decrypts_node_compatible_aes_gcm_payload(monkeypatch):
    key = bytes(range(32))
    nonce = bytes(range(12))
    expected = {
        "url": "https://www.twhg.com.tw/buy/DE02505039",
        "crm_property_id": "crm-doc-id",
        "requested_by_uid": "private-user-id",
        "request_id": "request-id",
    }
    encrypted_with_tag = AESGCM(key).encrypt(nonce, json.dumps(expected).encode(), None)
    ciphertext, tag = encrypted_with_tag[:-16], encrypted_with_tag[-16:]
    payload = base64.urlsafe_b64encode(nonce + tag + ciphertext).decode().rstrip("=")
    monkeypatch.setenv("MARKET_JOB_ENCRYPTION_KEY", base64.b64encode(key).decode())
    assert decrypt_payload(payload) == expected
