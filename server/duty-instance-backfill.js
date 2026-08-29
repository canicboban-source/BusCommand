"use strict";

const {
  canonicalDutyGuardKey,
  dutyGuardRef,
  isOperationalDutyType
} = require("./duty-instance-guard");

/**
 * Scan shifts for a company in an operational date window and backfill ops_active_duties guards.
 *
 * Contract:
 * - Scans shifts for the company.
 * - Filters for operational duties with non-empty routeCode/name.
 * - Detects duplicates on (groupId, date, dutyCode).
 * - Never silently chooses a winner if duplicates exist.
 * - In dry-run mode (default): reports non-conflicting guards that would be created and all conflicts.
 * - In apply mode: creates guards ONLY for non-conflicting assignments.
 * - Idempotent and resumable.
 *
 * @param {object} args
 * @param {FirebaseFirestore.Firestore} args.db
 * @param {object} args.admin
 * @param {string} args.companyId
 * @param {string} [args.startDate] YYYY-MM-DD
 * @param {string} [args.endDate] YYYY-MM-DD
 * @param {boolean} [args.dryRun=true]
 */
async function scanAndBackfillDutyGuards({
  db,
  admin,
  companyId,
  startDate = null,
  endDate = null,
  dryRun = true
}) {
  if (!companyId) {
    throw new Error("companyId is required for duty guard backfill.");
  }

  const companyRef = db.collection("companies").doc(companyId);
  let query = companyRef.collection("shifts");

  if (startDate) {
    query = query.where("date", ">=", startDate);
  }
  if (endDate) {
    query = query.where("date", "<=", endDate);
  }

  const shiftSnaps = await query.get();
  const dutyBuckets = new Map();

  shiftSnaps.docs.forEach((doc) => {
    const shift = doc.data() || {};
    const driverId = String(shift.driverId || "").trim();
    const date = String(shift.date || "").trim();
    const groupId = String(shift.groupId || shift.lineId || "").trim();
    const type = String(shift.type || "").trim().toLowerCase();
    const dutyCode = String(shift.routeCode || shift.name || "").trim().toUpperCase();

    if (!driverId || !date || !groupId || !isOperationalDutyType(type) || !dutyCode) {
      return;
    }

    const guardKey = canonicalDutyGuardKey({ groupId, serviceDate: date, dutyCode });
    if (!guardKey) return;

    if (!dutyBuckets.has(guardKey)) {
      dutyBuckets.set(guardKey, []);
    }
    dutyBuckets.get(guardKey).push({
      id: doc.id,
      driverId,
      driverName: shift.driverName || driverId,
      date,
      groupId,
      dutyCode,
      shiftType: shift.type,
      bus: shift.bus || ""
    });
  });

  const conflicts = [];
  const cleanGuards = [];

  for (const [guardKey, assignments] of dutyBuckets.entries()) {
    const uniqueDrivers = new Map();
    assignments.forEach((a) => uniqueDrivers.set(a.driverId, a));

    if (uniqueDrivers.size > 1) {
      const first = assignments[0];
      conflicts.push({
        guardKey,
        companyId,
        groupId: first.groupId,
        date: first.date,
        dutyCode: first.dutyCode,
        driverCount: uniqueDrivers.size,
        drivers: Array.from(uniqueDrivers.values()).map((a) => ({
          driverId: a.driverId,
          driverName: a.driverName,
          shiftDocumentId: a.id
        }))
      });
    } else {
      cleanGuards.push({
        guardKey,
        shift: assignments[0]
      });
    }
  }

  let guardsWritten = 0;
  if (!dryRun && cleanGuards.length > 0) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < cleanGuards.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = cleanGuards.slice(i, i + BATCH_SIZE);
      const now = admin.firestore.FieldValue.serverTimestamp();

      chunk.forEach(({ guardKey, shift }) => {
        const ref = dutyGuardRef(companyRef, guardKey);
        batch.set(ref, {
          schemaVersion: "v1",
          companyId,
          groupId: shift.groupId,
          serviceDate: shift.date,
          dutyCode: shift.dutyCode,
          shiftType: shift.shiftType || "morning",
          ownerDriverId: shift.driverId,
          ownerShiftDocumentId: shift.id,
          assignedBus: shift.bus || "",
          claimedBy: "backfill_script",
          claimedAt: now,
          updatedAt: now
        }, { merge: true });
      });

      await batch.commit();
      guardsWritten += chunk.length;
    }
  }

  return {
    companyId,
    dryRun,
    startDate,
    endDate,
    totalShiftsScanned: shiftSnaps.size,
    operationalDutyInstances: dutyBuckets.size,
    cleanGuardsCount: cleanGuards.length,
    conflictsCount: conflicts.length,
    guardsWritten,
    conflicts
  };
}

module.exports = {
  scanAndBackfillDutyGuards
};
