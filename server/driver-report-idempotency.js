/**
 * Idempotent driver report / lost-item create helpers (Ch13 / §15).
 */
"use strict";

function normalizeIdempotencyKey(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (key.length < 8 || key.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return null;
  return key;
}

/**
 * Find an existing doc for this driver + idempotency key.
 * Returns { id, data } or null.
 */
async function findByIdempotencyKey(collectionRef, driverId, idempotencyKey) {
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (!key || !driverId) return null;
  const snap = await collectionRef
    .where("driverId", "==", driverId)
    .where("idempotencyKey", "==", key)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() };
}

module.exports = {
  normalizeIdempotencyKey,
  findByIdempotencyKey
};
