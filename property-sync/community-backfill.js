#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { inferCommunity } = require("./community-matcher");

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDiGtIemWS0C4Pb-fNFBjDnoa2Z6ETwics",
  authDomain: "leshan-crm.firebaseapp.com",
  projectId: "leshan-crm",
  storageBucket: "leshan-crm.firebasestorage.app",
  messagingSenderId: "67951666720",
  appId: "1:67951666720:web:8c1fe1efd8579f155a3e45",
};

function keychainPassword(service, account) {
  return execFileSync("security", ["find-generic-password", "-s", service, "-a", account, "-w"], { encoding: "utf8" }).trim();
}

async function main() {
  const [{ initializeApp, deleteApp }, { getAuth, signInWithEmailAndPassword }, firestore] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("firebase/firestore"),
  ]);
  const app = initializeApp(FIREBASE_CONFIG, `community-backfill-${Date.now()}`);
  try {
    console.error("Reading saved CRM login...");
    const email = process.env.LESHAN_CRM_EMAIL || keychainPassword("leshan-property-sync-email", "crm");
    const password = process.env.LESHAN_CRM_PASSWORD || keychainPassword("leshan-property-sync-password", email);
    console.error("Signing in to CRM...");
    await signInWithEmailAndPassword(getAuth(app), email, password);
    console.error("Loading CRM properties...");
    const db = firestore.getFirestore(app);
    const snapshot = await firestore.getDocs(firestore.collection(db, "properties"));
    const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const changes = records.filter((item) => !String(item.communityName || "").trim())
      .map((item) => ({ item, inference: inferCommunity(item) }))
      .filter(({ inference }) => inference);
    const summary = {
      totalProperties: records.length,
      blankCommunity: records.filter((item) => !String(item.communityName || "").trim()).length,
      matchingProperties: changes.length,
      methods: changes.reduce((out, { inference }) => ({ ...out, [inference.method]: (out[inference.method] || 0) + 1 }), {}),
      proposed: changes.map(({ item, inference }) => ({ listingNo: item.listingNo, title: item.title, address: item.address, community: inference.name, method: inference.method })),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!process.argv.includes("--apply") || !changes.length) return;
    const backupDir = path.join(os.homedir(), ".leshan-property-sync", "community-backfill");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    const backupFile = path.join(backupDir, `properties-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ backedUpAt: new Date().toISOString(), records }, null, 2), { mode: 0o600 });
    for (let start = 0; start < changes.length; start += 400) {
      const batch = firestore.writeBatch(db);
      for (const { item, inference } of changes.slice(start, start + 400)) {
        batch.update(firestore.doc(db, "properties", item.id), { communityName: inference.name });
      }
      await batch.commit();
    }
    console.log(`APPLIED ${changes.length} community names; backup: ${backupFile}`);
  } finally {
    await deleteApp(app);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
