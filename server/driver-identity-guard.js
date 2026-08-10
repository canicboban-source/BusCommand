"use strict";

/**
 * D24.2 — tenant-scoped driver-identity uniqueness guard.
 *
 * Path: companies/{companyId}/ops/driver_identity_guard
 * Fields: revision, updatedAt only. Server-owned (browser deny via ops/*).
 *
 * D24.2.1-A: import identity key is EID only — no company_code / bcrypt in tx.
 */

const GUARD_COLLECTION = "ops";
const GUARD_DOC_ID = "driver_identity_guard";

function driverIdentityGuardRef(companyRef) {
  return companyRef.collection(GUARD_COLLECTION).doc(GUARD_DOC_ID);
}

/**
 * Read LIVE guard inside an open transaction (must run before any writes).
 * @returns {{ ref: FirebaseFirestore.DocumentReference, revision: number, exists: boolean }}
 */
async function readDriverIdentityGuardInTx(tx, companyRef) {
  const ref = driverIdentityGuardRef(companyRef);
  const snap = await tx.get(ref);
  const revision = snap.exists ? Number(snap.data()?.revision) : 0;
  return {
    ref,
    exists: snap.exists,
    revision: Number.isFinite(revision) && revision >= 0 ? revision : 0
  };
}

/**
 * Bump guard revision after all uniqueness reads and alongside profile/credential writes.
 */
function writeDriverIdentityGuardBumpInTx(tx, FieldValue, guard) {
  tx.set(guard.ref, {
    revision: guard.revision + 1,
    updatedAt: FieldValue.serverTimestamp()
  });
}

function assertLicenseAllowsDriverCreate(license) {
  const status = String(license?.licenseStatus || "").toLowerCase();
  if (status === "suspended") {
    const err = new Error("Licenca firme je suspendovana.");
    err.code = "license-suspended";
    throw err;
  }
  if (status === "expired") {
    const err = new Error("Licenca firme nije aktivna.");
    err.code = "license-unavailable";
    throw err;
  }
}

function eidKey(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Scan LIVE credentials for EID collision (case-insensitive).
 */
function findEidConflict(credentialDocs, eids) {
  const needles = new Set((eids || []).map(eidKey).filter(Boolean));
  if (!needles.size) return null;
  for (const doc of credentialDocs) {
    const key = eidKey(doc.data()?.eid);
    if (key && needles.has(key)) return key;
  }
  return null;
}

module.exports = {
  GUARD_COLLECTION,
  GUARD_DOC_ID,
  driverIdentityGuardRef,
  readDriverIdentityGuardInTx,
  writeDriverIdentityGuardBumpInTx,
  assertLicenseAllowsDriverCreate,
  findEidConflict,
  eidKey
};
