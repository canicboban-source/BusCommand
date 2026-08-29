"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canonicalDutyGuardKey,
  evaluateDutyGuardClaim
} = require("../../server/duty-instance-guard");
const { buildPlanImportPreview, PlanImportValidationError } = require("../../server/plan-import-preview");

test("Phase 2: Canonical Duty Instance Uniqueness Contract & Fail-First Proof", async (t) => {

  await t.test("1. canonicalDutyGuardKey derives deterministic, collision-resistant isolated keys", () => {
    const key1 = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "310.605" });
    const key2 = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "310.605 " });
    const key3 = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "310.605".toLowerCase() });

    assert.match(key1, /^v1_[a-f0-9]{64}$/, "Must be versioned 64-hex SHA-256 key");
    assert.equal(key2, key1, "Whitespace must be normalized");
    assert.equal(key3, key1, "Case must be normalized uppercase");

    // Unicode NFKC normalization
    const keyUnicode1 = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "\u0160ifra-1" });
    const keyUnicode2 = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "S\u030Cifra-1" });
    assert.equal(keyUnicode1, keyUnicode2, "Unicode decomposed and precomposed forms must normalize to same key");

    // Collision resistance against slashes/separators
    const keySlash = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "310/1" });
    const keyUnderscore = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "310_1" });
    assert.notEqual(keySlash, keyUnderscore, "Distinct codes with slashes vs underscores must NOT collide");

    // Cross-date isolation
    const keyDiffDate = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-02", dutyCode: "310.605" });
    assert.notEqual(key1, keyDiffDate, "Different dates must have different keys");

    // Cross-group isolation
    const keyDiffGroup = canonicalDutyGuardKey({ groupId: "line-200", serviceDate: "2026-09-01", dutyCode: "310.605" });
    assert.notEqual(key1, keyDiffGroup, "Different groups must have different keys");

    // Empty/invalid input handling
    assert.equal(canonicalDutyGuardKey({ groupId: "", serviceDate: "2026-09-01", dutyCode: "310.605" }), null);
    assert.equal(canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "invalid-date", dutyCode: "310.605" }), null);
    assert.equal(canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "" }), null);
  });

  await t.test("2. Sequential duplicate assignment to 3 drivers without buses is rejected with DUTY_ALREADY_ASSIGNED", () => {
    const key = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "310.605" });
    assert.ok(key);

    // Driver 1 (Dušan) claims guard
    const claim1 = evaluateDutyGuardClaim({
      guardData: null,
      driverId: "drv-dusan",
      driverName: "Dušan Popović",
      shiftDocumentId: "drv-dusan_2026-09-01",
      date: "2026-09-01",
      groupId: "line-310",
      dutyCode: "310.605"
    });
    assert.equal(claim1.ok, true);
    assert.equal(claim1.isNew, true);

    const activeGuard = {
      schemaVersion: "v1",
      companyId: "c-acme",
      groupId: "line-310",
      serviceDate: "2026-09-01",
      dutyCode: "310.605",
      ownerDriverId: "drv-dusan",
      ownerShiftDocumentId: "drv-dusan_2026-09-01",
      revision: 1
    };

    // Driver 2 (Aleksandar) attempts to claim same guard -> must fail
    const claim2 = evaluateDutyGuardClaim({
      guardData: activeGuard,
      driverId: "drv-aleksandar",
      driverName: "Aleksandar Nikolić",
      shiftDocumentId: "drv-aleksandar_2026-09-01",
      date: "2026-09-01",
      groupId: "line-310",
      dutyCode: "310.605"
    });
    assert.equal(claim2.ok, false);
    assert.equal(claim2.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(claim2.conflict.existingDriverId, "drv-dusan");

    // Driver 3 (Nemanja) attempts to claim same guard -> must fail
    const claim3 = evaluateDutyGuardClaim({
      guardData: activeGuard,
      driverId: "drv-nemanja",
      driverName: "Nemanja Petrović",
      shiftDocumentId: "drv-nemanja_2026-09-01",
      date: "2026-09-01",
      groupId: "line-310",
      dutyCode: "310.605"
    });
    assert.equal(claim3.ok, false);
    assert.equal(claim3.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(claim3.conflict.existingDriverId, "drv-dusan");
  });

  await t.test("3. Idempotent retry for the same driver and unchanged duty succeeds", () => {
    const activeGuard = {
      schemaVersion: "v1",
      companyId: "c-acme",
      groupId: "line-310",
      serviceDate: "2026-09-01",
      dutyCode: "310.605",
      ownerDriverId: "drv-dusan",
      ownerShiftDocumentId: "drv-dusan_2026-09-01",
      revision: 1
    };

    const claimRetry = evaluateDutyGuardClaim({
      guardData: activeGuard,
      driverId: "drv-dusan",
      driverName: "Dušan Popović",
      shiftDocumentId: "drv-dusan_2026-09-01",
      date: "2026-09-01",
      groupId: "line-310",
      dutyCode: "310.605"
    });

    assert.equal(claimRetry.ok, true);
    assert.equal(claimRetry.isSameOwner, true);
  });

  await t.test("4. Monthly-plan import preview rejects duplicate duty codes within payload", () => {
    const driversMap = new Map([
      ["drv-dusan", { id: "drv-dusan", name: "Dušan Popović", groupId: "line-310", active: true }],
      ["drv-aleksandar", { id: "drv-aleksandar", name: "Aleksandar Nikolić", groupId: "line-310", active: true }]
    ]);
    const dutyCatalog = new Map([
      ["310.605", { code: "310.605", start: "06:00", end: "14:00", dayType: "SCHOOL_WEEKDAY" }],
      ["310.605".toUpperCase(), { code: "310.605", start: "06:00", end: "14:00", dayType: "SCHOOL_WEEKDAY" }]
    ]);

    const importPayload = {
      groupId: "line-310",
      month: "2026-09",
      sourceName: "duplicate-duties.csv",
      reason: "test",
      rows: [
        { driverId: "drv-dusan", date: "2026-09-01", type: "morning", routeCode: "310.605", name: "310.605", bus: "", expectedRevision: 0 },
        { driverId: "drv-aleksandar", date: "2026-09-01", type: "morning", routeCode: "310.605", name: "310.605", bus: "", expectedRevision: 0 }
      ]
    };

    assert.throws(() => {
      buildPlanImportPreview({
        companyId: "c-acme",
        staffUid: "disp-1",
        payload: importPayload,
        driversById: driversMap,
        shiftsById: new Map(),
        dutiesByCode: dutyCatalog,
        busesByNumber: new Map(),
        requireDutyCatalog: true
      });
    }, (err) => {
      assert.ok(err instanceof PlanImportValidationError);
      const hasDutyDup = err.errors.some(e => e.code === "DUPLICATE_DUTY_ASSIGNMENT" || e.code === "DUTY_ALREADY_ASSIGNED");
      assert.ok(hasDutyDup, "Preview must include DUPLICATE_DUTY_ASSIGNMENT error");
      return true;
    });
  });

  await t.test("5. Monthly-plan import preview rejects duty code conflicting with existing guarded shift", () => {
    const driversMap = new Map([
      ["drv-aleksandar", { id: "drv-aleksandar", name: "Aleksandar Nikolić", groupId: "line-310", active: true }]
    ]);
    const dutyCatalog = new Map([
      ["310.605", { code: "310.605", start: "06:00", end: "14:00", dayType: "SCHOOL_WEEKDAY" }]
    ]);
    // Existing shift owned by Dušan on 2026-09-01
    const shiftsById = new Map([
      ["drv-dusan|2026-09-01", {
        driverId: "drv-dusan",
        driverName: "Dušan Popović",
        groupId: "line-310",
        date: "2026-09-01",
        type: "morning",
        routeCode: "310.605",
        name: "310.605",
        revision: 1
      }]
    ]);

    const importPayload = {
      groupId: "line-310",
      month: "2026-09",
      sourceName: "import-against-existing.csv",
      reason: "test",
      rows: [
        { driverId: "drv-aleksandar", date: "2026-09-01", type: "morning", routeCode: "310.605", name: "310.605", bus: "", expectedRevision: 0 }
      ]
    };

    assert.throws(() => {
      buildPlanImportPreview({
        companyId: "c-acme",
        staffUid: "disp-1",
        payload: importPayload,
        driversById: driversMap,
        shiftsById,
        dutiesByCode: dutyCatalog,
        busesByNumber: new Map(),
        requireDutyCatalog: true
      });
    }, (err) => {
      assert.ok(err instanceof PlanImportValidationError);
      const hasConflict = err.errors.some(e => e.code === "DUTY_ALREADY_ASSIGNED");
      assert.ok(hasConflict, "Preview must detect conflict against existing shift");
      return true;
    });
  });

  await t.test("6. Passive entries (off, vacation, sick, clear) do not claim operational duty guards", () => {
    const keyOff = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "" });
    assert.equal(keyOff, null, "Passive entries have no duty code and derive no guard key");
  });

  await t.test("7. Cross-date and cross-group assignments for the same duty code do not collide", () => {
    const keyGroupA = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-01", dutyCode: "310.605" });
    const keyGroupB = canonicalDutyGuardKey({ groupId: "line-200", serviceDate: "2026-09-01", dutyCode: "310.605" });
    const keyDate2 = canonicalDutyGuardKey({ groupId: "line-310", serviceDate: "2026-09-02", dutyCode: "310.605" });

    assert.notEqual(keyGroupA, keyGroupB);
    assert.notEqual(keyGroupA, keyDate2);

    // Group B claim
    const claimB = evaluateDutyGuardClaim({
      guardData: null,
      driverId: "drv-aleksandar",
      driverName: "Aleksandar Nikolić",
      shiftDocumentId: "drv-aleksandar_2026-09-01",
      date: "2026-09-01",
      groupId: "line-200",
      dutyCode: "310.605"
    });
    assert.equal(claimB.ok, true);

    // Date 2 claim
    const claimDate2 = evaluateDutyGuardClaim({
      guardData: null,
      driverId: "drv-nemanja",
      driverName: "Nemanja Petrović",
      shiftDocumentId: "drv-nemanja_2026-09-02",
      date: "2026-09-02",
      groupId: "line-310",
      dutyCode: "310.605"
    });
    assert.equal(claimDate2.ok, true);
  });

  await t.test("8. Backfill CLI safety contract enforces dry-run default, explicit matching project flags for apply, and rejects unsafe arguments", () => {
    const { parseAndValidateBackfillArgs } = require("../../scripts/backfill-duty-guards");

    // 1. Missing --company -> throws
    assert.throws(() => {
      parseAndValidateBackfillArgs([]);
    }, /SAFETY ERROR: --company <companyId> is required/);

    // 2. Default is dry-run
    const dryRunArgs = parseAndValidateBackfillArgs(["--company", "c-test"]);
    assert.equal(dryRunArgs.companyId, "c-test");
    assert.equal(dryRunArgs.apply, false);
    assert.equal(dryRunArgs.dryRun, true);

    // 3. --apply without --project -> throws
    assert.throws(() => {
      parseAndValidateBackfillArgs(["--company", "c-test", "--apply"]);
    }, /SAFETY ERROR: --apply requires explicit --project <projectId> AND --confirm-project <projectId>/);

    // 4. --apply with --project but missing --confirm-project -> throws
    assert.throws(() => {
      parseAndValidateBackfillArgs(["--company", "c-test", "--apply", "--project", "p-test"]);
    }, /SAFETY ERROR: --apply requires explicit --project <projectId> AND --confirm-project <projectId>/);

    // 5. --apply with mismatched --project and --confirm-project -> throws
    assert.throws(() => {
      parseAndValidateBackfillArgs(["--company", "c-test", "--apply", "--project", "p-test", "--confirm-project", "p-other"]);
    }, /SAFETY ERROR: --project \('p-test'\) and --confirm-project \('p-other'\) do not match/);

    // 6. --apply with matching --project and --confirm-project -> valid apply configuration
    const applyArgs = parseAndValidateBackfillArgs([
      "--company", "c-test",
      "--apply",
      "--project", "demo-buscommand-scale",
      "--confirm-project", "demo-buscommand-scale",
      "--from", "2026-09-01",
      "--to", "2026-09-30"
    ]);
    assert.equal(applyArgs.companyId, "c-test");
    assert.equal(applyArgs.apply, true);
    assert.equal(applyArgs.dryRun, false);
    assert.equal(applyArgs.project, "demo-buscommand-scale");
    assert.equal(applyArgs.confirmProject, "demo-buscommand-scale");
    assert.equal(applyArgs.startDate, "2026-09-01");
    assert.equal(applyArgs.endDate, "2026-09-30");
  });

  await t.test("9. scanAndBackfillDutyGuards enforces zero writes in dry-run, reports legacy duplicates without picking winners, and writes only clean guards in apply mode", async () => {
    const { scanAndBackfillDutyGuards } = require("../../server/duty-instance-backfill");

    // Mock shift documents in company
    const mockShifts = [
      // Clean duty 1
      { id: "shf-1", driverId: "drv-1", driverName: "Driver 1", groupId: "310", date: "2026-09-01", type: "morning", routeCode: "310.101" },
      // Conflicting duty 2: both drv-2 and drv-3 assigned 310.202 on same date and group
      { id: "shf-2", driverId: "drv-2", driverName: "Driver 2", groupId: "310", date: "2026-09-01", type: "morning", routeCode: "310.202" },
      { id: "shf-3", driverId: "drv-3", driverName: "Driver 3", groupId: "310", date: "2026-09-01", type: "morning", routeCode: "310.202" },
      // Passive shift: should be ignored by backfill
      { id: "shf-4", driverId: "drv-4", driverName: "Driver 4", groupId: "310", date: "2026-09-01", type: "off", routeCode: "" }
    ];

    const writtenBatches = [];
    const mockDb = {
      collection(colName) {
        assert.equal(colName, "companies");
        return {
          doc(docId) {
            assert.equal(docId, "c-test");
            return {
              collection(subName) {
                if (subName === "shifts") {
                  return {
                    where() { return this; },
                    async get() {
                      return {
                        size: mockShifts.length,
                        docs: mockShifts.map(s => ({
                          id: s.id,
                          data() { return s; }
                        }))
                      };
                    }
                  };
                }
                if (subName === "ops_active_duties") {
                  return {
                    doc(guardId) {
                      return { id: guardId, path: `companies/c-test/ops_active_duties/${guardId}` };
                    }
                  };
                }
                throw new Error(`Unexpected subcollection ${subName}`);
              }
            };
          }
        };
      },
      batch() {
        const batchWrites = [];
        return {
          set(ref, data, opts) {
            batchWrites.push({ ref, data, opts });
          },
          async commit() {
            writtenBatches.push(batchWrites);
          }
        };
      }
    };

    const mockAdmin = {
      firestore: {
        FieldValue: {
          serverTimestamp() { return "MOCK_TIMESTAMP"; }
        }
      }
    };

    // 1. Dry run execution: 0 writes committed
    const dryRunResult = await scanAndBackfillDutyGuards({
      db: mockDb,
      admin: mockAdmin,
      companyId: "c-test",
      dryRun: true
    });

    assert.equal(dryRunResult.dryRun, true);
    assert.equal(dryRunResult.totalShiftsScanned, 4);
    assert.equal(dryRunResult.operationalDutyInstances, 2); // 310.101 and 310.202
    assert.equal(dryRunResult.cleanGuardsCount, 1); // 310.101
    assert.equal(dryRunResult.conflictsCount, 1); // 310.202
    assert.equal(dryRunResult.guardsWritten, 0);
    assert.equal(writtenBatches.length, 0, "Dry-run must make ZERO batch writes");

    // Conflicting duty reports all conflicting drivers without choosing a winner
    assert.equal(dryRunResult.conflicts[0].dutyCode, "310.202");
    assert.equal(dryRunResult.conflicts[0].driverCount, 2);
    assert.deepEqual(dryRunResult.conflicts[0].drivers.map(d => d.driverId).sort(), ["drv-2", "drv-3"]);

    // 2. Apply execution: writes clean guards only, skips conflicts
    const applyResult = await scanAndBackfillDutyGuards({
      db: mockDb,
      admin: mockAdmin,
      companyId: "c-test",
      dryRun: false
    });

    assert.equal(applyResult.dryRun, false);
    assert.equal(applyResult.cleanGuardsCount, 1);
    assert.equal(applyResult.conflictsCount, 1);
    assert.equal(applyResult.guardsWritten, 1);
    assert.equal(writtenBatches.length, 1);
    assert.equal(writtenBatches[0].length, 1);
    assert.equal(writtenBatches[0][0].data.dutyCode, "310.101");
    assert.equal(writtenBatches[0][0].data.ownerDriverId, "drv-1");
  });

  await t.test("10. Backfill idempotence: safe apply executed repeatedly produces identical guard ownership, zero duplicate documents, and consistent conflict reporting", async () => {
    const { scanAndBackfillDutyGuards } = require("../../server/duty-instance-backfill");

    const mockShifts = [
      { id: "shf-1", driverId: "drv-1", driverName: "Driver 1", groupId: "310", date: "2026-09-01", type: "morning", routeCode: "310.101" },
      { id: "shf-2", driverId: "drv-2", driverName: "Driver 2", groupId: "310", date: "2026-09-01", type: "morning", routeCode: "310.202" },
      { id: "shf-3", driverId: "drv-3", driverName: "Driver 3", groupId: "310", date: "2026-09-01", type: "morning", routeCode: "310.202" }
    ];

    const guardStore = new Map();
    const writtenBatches = [];

    const mockDb = {
      collection(colName) {
        assert.equal(colName, "companies");
        return {
          doc(docId) {
            assert.equal(docId, "c-test");
            return {
              collection(subName) {
                if (subName === "shifts") {
                  return {
                    where() { return this; },
                    async get() {
                      return {
                        size: mockShifts.length,
                        docs: mockShifts.map(s => ({ id: s.id, data() { return s; } }))
                      };
                    }
                  };
                }
                if (subName === "ops_active_duties") {
                  return {
                    doc(guardId) {
                      return { id: guardId, path: `companies/c-test/ops_active_duties/${guardId}` };
                    }
                  };
                }
                throw new Error(`Unexpected subcollection ${subName}`);
              }
            };
          }
        };
      },
      batch() {
        const batchWrites = [];
        return {
          set(ref, data, opts) {
            batchWrites.push({ ref, data, opts });
          },
          async commit() {
            writtenBatches.push(batchWrites);
            batchWrites.forEach(({ ref, data }) => guardStore.set(ref.id, data));
          }
        };
      }
    };

    const mockAdmin = {
      firestore: { FieldValue: { serverTimestamp() { return "MOCK_TIMESTAMP"; } } }
    };

    // 1st Apply run
    const result1 = await scanAndBackfillDutyGuards({ db: mockDb, admin: mockAdmin, companyId: "c-test", dryRun: false });
    assert.equal(result1.cleanGuardsCount, 1);
    assert.equal(result1.conflictsCount, 1);
    assert.equal(result1.guardsWritten, 1);
    assert.equal(guardStore.size, 1);
    const firstGuardSnapshot = JSON.stringify(guardStore.get(Array.from(guardStore.keys())[0]));

    // 2nd Apply run (idempotent retry)
    const result2 = await scanAndBackfillDutyGuards({ db: mockDb, admin: mockAdmin, companyId: "c-test", dryRun: false });
    assert.equal(result2.cleanGuardsCount, 1);
    assert.equal(result2.conflictsCount, 1);
    assert.equal(result2.guardsWritten, 1);
    assert.equal(guardStore.size, 1, "Must NOT create duplicate guard keys or documents");
    const secondGuardSnapshot = JSON.stringify(guardStore.get(Array.from(guardStore.keys())[0]));
    assert.equal(secondGuardSnapshot, firstGuardSnapshot, "Guard payload and owner must be completely identical");
  });
});
