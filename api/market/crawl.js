const { FieldValue } = require("firebase-admin/firestore");
const { ensureFirebaseAdmin, requireFirebaseUser } = require("../_lib/market-auth");
const { callWorker } = require("../_lib/market-worker");

const PROPERTY_ID = /^[A-Za-z0-9_-]{1,128}$/;

function safeDocId(value) {
  return String(value || "unknown").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 180);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: { code: "METHOD_NOT_ALLOWED" } });
  }

  try {
    const user = await requireFirebaseUser(req);
    const crmPropertyId = String(req.body?.crm_property_id || "");
    const url = String(req.body?.url || "");
    if (!PROPERTY_ID.test(crmPropertyId) || url.length > 2048) {
      return res.status(400).json({ success: false, error: { code: "INVALID_REQUEST" } });
    }

    const workerResponse = await callWorker("/pipeline/property", {
      method: "POST",
      body: JSON.stringify({ url, crm_property_id: crmPropertyId }),
    });
    const payload = await workerResponse.json().catch(() => null);
    if (!workerResponse.ok || !payload?.success) {
      return res.status(workerResponse.status >= 400 && workerResponse.status < 500 ? 400 : 502).json(
        payload || { success: false, error: { code: "CRAWLER_UNAVAILABLE" } }
      );
    }

    const { firestore } = ensureFirebaseAdmin();
    const propertyRef = firestore.collection("properties").doc(crmPropertyId);
    const propertySnapshot = await propertyRef.get();
    if (!propertySnapshot.exists) {
      return res.status(404).json({ success: false, error: { code: "CRM_PROPERTY_NOT_FOUND" } });
    }

    const source = safeDocId(payload.source);
    const sourcePropertyId = safeDocId(payload.source_property_id);
    const listingId = `${source}_${sourcePropertyId}`;
    const listingRef = propertyRef.collection("marketListings").doc(listingId);
    const existingPhotos = await propertyRef.collection("marketPhotos")
      .where("listingId", "==", listingId).get();
    const photos = Array.isArray(payload.images) ? payload.images.slice(0, 100) : [];

    const batch = firestore.batch();
    existingPhotos.docs.forEach((photo) => batch.delete(photo.ref));
    batch.set(listingRef, {
      ...payload.property,
      listingId,
      source: payload.source,
      sourcePropertyId: payload.source_property_id,
      sourceUrl: payload.property?.source_url || url,
      warnings: payload.warnings || [],
      imageCount: photos.length,
      lastCrawledAt: payload.property?.crawl_time || new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: user.uid,
    }, { merge: true });

    photos.forEach((photo, index) => {
      const photoId = safeDocId(photo.drive_file_id || photo.sha256 || `${listingId}_${index + 1}`);
      batch.set(propertyRef.collection("marketPhotos").doc(photoId), {
        ...photo,
        listingId,
        source: payload.source,
        sourcePropertyId: payload.source_property_id,
        publicAdAllowed: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    batch.update(propertyRef, {
      marketLastCrawledAt: FieldValue.serverTimestamp(),
      marketLastSource: payload.source,
      marketLastSourcePropertyId: payload.source_property_id,
    });
    await batch.commit();

    return res.status(200).json({
      success: true,
      source: payload.source,
      source_property_id: payload.source_property_id,
      saved: { listing: listingId, photos: photos.length },
      warnings: payload.warnings || [],
    });
  } catch (error) {
    console.error("market crawl failed", error);
    const status = error.statusCode || (error.name === "AbortError" ? 504 : 500);
    return res.status(status).json({
      success: false,
      error: { code: status === 401 ? "UNAUTHORIZED" : "MARKET_CRAWL_FAILED", message: error.message },
    });
  }
};

module.exports.config = { maxDuration: 300 };
