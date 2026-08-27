#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { inferPropertyLocation } = require("./location-inference");

const APPLY = process.argv.includes("--apply");
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDiGtIemWS0C4Pb-fNFBjDnoa2Z6ETwics", authDomain: "leshan-crm.firebaseapp.com",
  projectId: "leshan-crm", storageBucket: "leshan-crm.firebasestorage.app",
  messagingSenderId: "67951666720", appId: "1:67951666720:web:8c1fe1efd8579f155a3e45",
};

function keychainPassword(service, account) {
  return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" }).trim();
}

async function main() {
  const [{ initializeApp, deleteApp }, { getAuth, signInWithEmailAndPassword }, firestore] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("firebase/firestore"),
  ]);
  const { getFirestore, collection, getDocs, doc, writeBatch } = firestore;
  const email = process.env.LESHAN_CRM_EMAIL || keychainPassword("leshan-property-sync-email", "crm");
  const password = process.env.LESHAN_CRM_PASSWORD || keychainPassword("leshan-property-sync-password", email);
  const app = initializeApp(FIREBASE_CONFIG, `property-location-backfill-${Date.now()}`);
  try {
    await signInWithEmailAndPassword(getAuth(app), email, password);
    const db = getFirestore(app);
    const snapshot = await getDocs(collection(db, "properties"));
    const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const changes = records.flatMap((record) => {
      const inferred = inferPropertyLocation(record);
      const updates = {};
      if (!String(record.communityName || "").trim() && inferred.communityName) updates.communityName = inferred.communityName;
      const currentArea = String(record.area || "").trim();
      if ((!currentArea || currentArea === "A7重劃區") && inferred.area && inferred.area !== currentArea) updates.area = inferred.area;
      if (Object.keys(updates).length === 0) return [];
      return [{ id: record.id, title: record.title || "", address: record.address || "", updates }];
    });
    const counts = {
      scanned: records.length,
      changed: changes.length,
      community: changes.filter((item) => item.updates.communityName).length,
      area: changes.filter((item) => item.updates.area).length,
    };
    const areaBreakdown = changes.reduce((result, item) => {
      if (item.updates.area) result[item.updates.area] = (result[item.updates.area] || 0) + 1;
      return result;
    }, {});
    console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", counts, areaBreakdown, sample: changes.slice(0, 30) }, null, 2));
    if (!APPLY || changes.length === 0) return;

    const outputDir = path.join(__dirname, "output", "location-backfill");
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.writeFileSync(path.join(outputDir, `before-${stamp}.json`), `${JSON.stringify(records, null, 2)}\n`);
    for (let index = 0; index < changes.length; index += 450) {
      const batch = writeBatch(db);
      changes.slice(index, index + 450).forEach((change) => batch.update(doc(db, "properties", change.id), {
        ...change.updates,
        locationAutoFilledAt: new Date().toISOString(),
        locationAutoFillVersion: 2,
      }));
      await batch.commit();
    }
    console.log(`Applied ${changes.length} property location updates.`);
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
