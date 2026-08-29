"use strict";

/**
 * Server-owned canonical daily duty uniqueness guard (FAZA 3 / P1).
 *
 * Enforces authoritative 1-to-1 mapping between a concrete operational duty
 * and an assigned driver for a given company, line group, and service date.
 *
 * Path: companies/{companyId}/ops_active_duties/{canonicalDutyKey}
 * Browser read/write is strictly DENIED in firestore.rules.
 */

const crypto = require("crypto");

const DUTY_GUARD_COLLECTION = "ops_active_duties";
const ACTIVE_DUTY_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft", "standby"]);
const PASSIVE_DUTY_TYPES = new Set(["off", "vacation", "sick", "clear"]);

function normalizeDutyCode(code) {
  return String(code || "").normalize("NFKC").trim().toUpperCase();
}

function normalizeServiceDate(dateStr) {
  const clean = String(dateStr || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

function normalizeGroupId(groupId) {
  const clean = String(groupId || "").normalize("NFKC").trim();
  return clean.length > 0 ? clean : null;
}

/**
 * Derives the deterministic, collision-resistant guard document ID.
 * @param {{ groupId: string, serviceDate: string, dutyCode: string }} params
 * @returns {string|null}
 */
function canonicalDutyGuardKey({ groupId, serviceDate, dutyCode }) {
  const gid = normalizeGroupId(groupId);
  const date = normalizeServiceDate(serviceDate);
  const code = normalizeDutyCode(dutyCode);

  if (!gid || !date || !code) {
    return null;
  }

  const hash = crypto
    .createHash("sha256")
    .update(`${gid}\0${date}\0${code}`, "utf8")
    .digest("hex");

  return `v1_${hash}`;
}

function dutyGuardRef(companyRef, guardKey) {
  if (!guardKey) return null;
  return companyRef.collection(DUTY_GUARD_COLLECTION).doc(guardKey);
}

/**
 * Read LIVE duty guard inside an open transaction (must run before any writes).
 * @param {FirebaseFirestore.Transaction} tx
 * @param {FirebaseFirestore.DocumentReference} companyRef
 * @param {string} guardKey
 */
async function readDutyGuardInTx(tx, companyRef, guardKey) {
  if (!guardKey) return { ref: null, snap: null, exists: false, data: null };
  const ref = dutyGuardRef(companyRef, guardKey);
  const snap = await tx.get(ref);
  return {
    ref,
    snap,
    exists: snap.exists,
    data: snap.exists ? snap.data() : null
  };
}

/**
 * Pure helper to evaluate whether a driver can claim a duty guard.
 * @param {{
 *   guardData: object|null,
 *   driverId: string,
 *   driverName?: string,
 *   shiftDocumentId?: string,
 *   date: string,
 *   groupId: string,
 *   dutyCode: string
 * }} args
 */
/**
 * Pure helper to evaluate whether a driver can claim a duty guard.
 * @param {{
 *   guardData: object|null,
 *   driverId: string,
 *   driverName?: string,
 *   shiftDocumentId?: string,
 *   date: string,
 *   groupId: string,
 *   dutyCode: string
 * }} args
 */
function evaluateDutyGuardClaim({
  guardData,
  driverId,
  _driverName = "",
  _shiftDocumentId = "",
  date,
  groupId,
  dutyCode
}) {
  const normalizedCode = normalizeDutyCode(dutyCode);

  if (!guardData) {
    return { ok: true, isNew: true };
  }

  const currentOwnerId = String(guardData.ownerDriverId || "").trim();
  const requestingDriverId = String(driverId || "").trim();

  if (currentOwnerId === requestingDriverId) {
    return { ok: true, isSameOwner: true };
  }

  const existingDriverName = String(guardData.ownerDriverName || currentOwnerId || "drugom vozaču").trim();
  const existingShiftId = String(guardData.ownerShiftDocumentId || "").trim();

  return {
    ok: false,
    code: "DUTY_ALREADY_ASSIGNED",
    error: `Smena ${normalizedCode} za ${date} već je dodeljena vozaču ${existingDriverName}.`,
    conflict: {
      dutyCode: normalizedCode,
      date,
      groupId,
      existingDriverId: currentOwnerId,
      existingDriverName,
      existingShiftId
    }
  };
}

/**
 * Write/Claim a duty guard inside an open transaction.
 * Stores only ownerDriverId and ownerShiftDocumentId (strict data minimization / zero PII snapshot).
 */
function writeDutyGuardClaimInTx(tx, guardRef, FieldValue, payload) {
  if (!guardRef) return;
  const now = FieldValue.serverTimestamp();
  tx.set(guardRef, {
    schemaVersion: "v1",
    companyId: payload.companyId || "",
    groupId: payload.groupId || "",
    serviceDate: payload.serviceDate || "",
    dutyCode: normalizeDutyCode(payload.dutyCode),
    shiftType: payload.shiftType || "morning",
    ownerDriverId: payload.ownerDriverId || "",
    ownerShiftDocumentId: payload.ownerShiftDocumentId || "",
    assignedBus: payload.assignedBus || "",
    claimedBy: payload.staffUid || "",
    claimedAt: now,
    updatedAt: now
  });
}

/**
 * Release/Delete a duty guard inside an open transaction.
 */
function writeDutyGuardReleaseInTx(tx, guardRef) {
  if (!guardRef) return;
  tx.delete(guardRef);
}

/**
 * Atomically transfer ownership of a duty guard to a new driver (e.g. incident replacement).
 */
function writeDutyGuardTransferInTx(tx, guardRef, FieldValue, newPayload) {
  if (!guardRef) return;
  const now = FieldValue.serverTimestamp();
  tx.set(guardRef, {
    ownerDriverId: newPayload.ownerDriverId || "",
    ownerShiftDocumentId: newPayload.ownerShiftDocumentId || "",
    assignedBus: newPayload.assignedBus !== undefined ? newPayload.assignedBus : "",
    claimedBy: newPayload.staffUid || "",
    updatedAt: now
  }, { merge: true });
}

function isOperationalDutyType(type) {
  return ACTIVE_DUTY_TYPES.has(String(type || "").toLowerCase());
}

function isPassiveDutyType(type) {
  return PASSIVE_DUTY_TYPES.has(String(type || "").toLowerCase());
}

module.exports = {
  DUTY_GUARD_COLLECTION,
  ACTIVE_DUTY_TYPES,
  PASSIVE_DUTY_TYPES,
  normalizeDutyCode,
  normalizeServiceDate,
  normalizeGroupId,
  canonicalDutyGuardKey,
  dutyGuardRef,
  readDutyGuardInTx,
  evaluateDutyGuardClaim,
  writeDutyGuardClaimInTx,
  writeDutyGuardReleaseInTx,
  writeDutyGuardTransferInTx,
  isOperationalDutyType,
  isPassiveDutyType
};
