"""Publish only the encrypted, read-only CRM reference snapshot. Never copy credentials."""
import argparse
import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

FIELDS = ("id", "date", "address", "floor", "type", "use", "area", "price", "unit", "parkingType", "parkingArea", "parkingPrice", "parkingCount", "rooms", "halls", "baths", "built", "remark", "special")
ZONES = {"A7", "A8", "A9"}
FORMAT_VERSION = 1

def cloud_source(source):
    import firebase_admin
    from firebase_admin import credentials, firestore
    app = firebase_admin.initialize_app(credentials.Certificate(str(source / "agent/serviceAccount.json")), name="crm-snapshot-publisher")
    db = firestore.client(app=app)
    meta = db.document("communities/meta").get().to_dict() or {}
    return db, meta

def cloud_master(db, meta):
    parts = []
    for n in range(int(meta.get("parts", 0))):
        part = db.document(f"commParts/{n}").get().to_dict() or {}
        if part.get("version") != meta.get("version"): raise RuntimeError("Community source is updating; retry next run")
        parts.append(part["data"])
    if not parts: raise RuntimeError("Published community master is empty")
    return json.loads("".join(parts))

def build_payload(source, meta, master):
    sys.path.insert(0, str(source / "agent"))
    import community
    root = source / "web/public/realprice"
    official = json.loads((root / "official-index.json").read_text())
    index = community.DoorIndex(master)
    communities = {}
    names = {}
    for cid, c in index.by_id.items():
        if c.get("zone") not in ZONES: continue
        cid = str(cid)
        amenities, fees = c.get("amenities") or {}, c.get("fees") or {}
        public = {"id": cid, "name": str(c["name"]), "zone": c["zone"], "city": c.get("city", ""), "district": c.get("district", ""),
                  "households": c.get("hh"), "updatedAt": meta.get("version"),
                  "amenities": {"list": [str(v)[:20] for v in amenities.get("list", [])[:40]], "note": str(amenities.get("note") or "")[:120], "updatedAt": amenities.get("at")},
                  "fees": {"perPing": fees.get("mgmt"), "parkingMonthly": fees.get("car"), "updatedAt": fees.get("at")}}
        communities[cid] = {"community": public, "district": c.get("district", ""), "deals": [], "years": []}
        for name in [c["name"], *(c.get("aliases") or [])]:
            key = community.norm(name)
            if key and cid not in names.setdefault(key, []): names[key].append(cid)
    selected = []
    for district in ("龜山區", "林口區"):
        files = sorted((n for n in official["yearFiles"] if n.startswith(f"{district}-sale-") and n.endswith(".json")), reverse=True)[:2]
        selected.extend(files)
        years = [int(Path(n).stem.split("-")[-1]) for n in files]
        for entry in communities.values():
            if entry["district"] == district: entry["years"] = years
    seen = set()
    for filename in selected:
        for row in json.loads((root / filename).read_text()):
            if row.get("kind") != "sale" or row.get("special") is not False or row.get("id") in seen: continue
            match = index.match(row.get("address", ""), row.get("district", ""))
            cid = str(match["id"]) if match else ""
            if cid not in communities: continue
            seen.add(row["id"])
            communities[cid]["deals"].append({k: row.get(k) for k in FIELDS if k in row})
    for entry in communities.values(): entry["deals"].sort(key=lambda r: r.get("date") or "", reverse=True)
    if not communities or not seen: raise RuntimeError("Source is empty; keep the last good cloud snapshot")
    # Refuse a partial source refresh rather than publishing mixed generations.
    if json.loads((root / "official-index.json").read_text()).get("version") != official["version"]:
        raise RuntimeError("Official source is updating; retry next run")
    doors = {k: str(cid) for k, cid in index.by_key.items() if str(cid) in communities}
    bases = {}
    for door, cid in doors.items(): bases.setdefault(door.split("|", 1)[1], set()).add(cid)
    return {"schema": 1, "snapshotAt": round(time.time() * 1000), "version": f"{official['version']}-{meta['version']}",
            "source": official.get("source"), "publishedDate": official.get("publishedDate"),
            "communities": communities, "names": names, "doors": doors,
            "uniqueDoors": {k: next(iter(v)) for k, v in bases.items() if len(v) == 1},
            "regions": {"cities": community._CITIES, "districts": community._DISTS, "oldCities": community.OLD_CITY}}

def encrypt_payload(payload, secret):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = base64.urlsafe_b64decode(secret.strip() + "=" * (-len(secret.strip()) % 4))
    if len(key) != 32: raise RuntimeError("Invalid snapshot encryption key")
    plain = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()
    nonce = os.urandom(12)
    encoded = AESGCM(key).encrypt(nonce, gzip.compress(plain, mtime=0), None)
    b64 = lambda v: base64.b64encode(v).decode()
    return {"schema": 1, "revision": payload["version"], "keyId": hashlib.sha256(key).hexdigest()[:16],
            "snapshotAt": payload["snapshotAt"], "iv": b64(nonce), "tag": b64(encoded[-16:]), "data": b64(encoded[:-16])}

def git(*args):
    subprocess.run(["git", *args], check=True, stdout=subprocess.DEVNULL)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--key-file", required=True, type=Path)
    parser.add_argument("--output", default="api/_data/crm-reference-snapshot.json", type=Path)
    parser.add_argument("--push", action="store_true")
    args = parser.parse_args()
    if args.push:
        git("fetch", "origin"); git("merge", "--ff-only", "origin/main")
    official = json.loads((args.source_root / "web/public/realprice/official-index.json").read_text())
    db, meta = cloud_source(args.source_root)
    revision = f"{official['version']}-{meta['version']}"
    secret = args.key_file.read_text()
    key = base64.urlsafe_b64decode(secret.strip() + "=" * (-len(secret.strip()) % 4))
    key_id = hashlib.sha256(key).hexdigest()[:16]
    previous = json.loads(args.output.read_text()) if args.output.exists() else {}
    if previous.get("revision") == revision and previous.get("keyId") == key_id and previous.get("formatVersion") == FORMAT_VERSION:
        print("Cloud snapshot already current; no deployment needed.")
        if args.push: git("push", "origin", "main")
        return
    master = cloud_master(db, meta)
    payload = build_payload(args.source_root, meta, master)
    if db.document("communities/meta").get().to_dict().get("version") != meta["version"]:
        raise RuntimeError("Community source is updating; keep the last good snapshot")
    envelope = encrypt_payload(payload, secret)
    envelope["formatVersion"] = FORMAT_VERSION
    args.output.parent.mkdir(parents=True, exist_ok=True)
    staged = args.output.with_suffix(".new")
    staged.write_text(json.dumps(envelope, separators=(",", ":")))
    staged.replace(args.output)
    print(f"Encrypted cloud snapshot: {len(payload['communities'])} communities, {sum(len(c['deals']) for c in payload['communities'].values())} sales, {args.output.stat().st_size} bytes.")
    if args.push:
        git("add", str(args.output)); git("commit", "-m", "Refresh encrypted cloud market reference snapshot"); git("push", "origin", "main")

if __name__ == "__main__": main()
