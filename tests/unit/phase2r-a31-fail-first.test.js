/**
 * FAZA 2R-A.3.1 — fail-first guards (must be RED on A.3, GREEN after A.3.1).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const staffSrc = fs.readFileSync(
  path.join(__dirname, "../../server/staff-monthly-plan-import.js"),
  "utf8"
);
const groupSrc = fs.readFileSync(
  path.join(__dirname, "../../server/group-monthly-plan-import.js"),
  "utf8"
);
const routesSrc = fs.readFileSync(
  path.join(__dirname, "../../server/driver-routes.js"),
  "utf8"
);

test("A.3.1 source: import chunks use runTransaction (not getAll→batch race)", () => {
  // Chunk path must not rely on standalone getAll + batch.commit for shift writes.
  assert.match(staffSrc, /applyImportChunkTransaction|writeImportChunkTransaction|chunkTransaction/);
  assert.doesNotMatch(
    staffSrc,
    /for \(let offset = 0; offset < rows\.length; offset \+= _writeChunkSize\) \{\s*const chunk[\s\S]*?const currentSnaps = await db\.getAll/
  );
});

test("A.3.1 source: claim blocks prepared+appliedChunks / recoveryRequired", () => {
  assert.match(staffSrc, /appliedChunks/);
  assert.match(staffSrc, /prepared_partial|prepared.*appliedChunks|appliedChunks.*>.*0/);
  // Must not set expired then throw inside same tx (abort would drop the write).
  assert.doesNotMatch(
    staffSrc,
    /tx\.set\(importRef,\s*\{\s*status:\s*"expired"[\s\S]{0,80}throw new GroupMonthlyImportError\("MONTHLY_IMPORT_EXPIRED"/
  );
});

test("A.3.1 source: completion requires alive consistent lock", () => {
  assert.match(staffSrc, /completion_.*lock|lockAlive|isLockAlive/);
  assert.match(staffSrc, /completion_status_mismatch|completion_lock/);
});

test("A.3.1 source: shared in-tx lock evaluator exported", () => {
  assert.match(groupSrc, /evaluateMonthlyImportLockState|readMonthlyImportLockInTx/);
  assert.match(groupSrc, /module\.exports[\s\S]*evaluateMonthlyImportLockState|readMonthlyImportLockInTx/);
});

test("A.3.1 source: assignment + undo read import lock inside mutation tx", () => {
  const assignIdx = routesSrc.indexOf('app.put("/api/staff/shifts/assignment"');
  const undoIdx = routesSrc.indexOf('app.post("/api/staff/shifts/assignment/undo"');
  // FAZA 3 resource guards expanded the assignment handler — keep a wide slice.
  const assignBlock = routesSrc.slice(assignIdx, assignIdx + 12000);
  const undoBlock = routesSrc.slice(undoIdx, undoIdx + 3500);
  assert.match(assignBlock, /readMonthlyImportLockInTx|evaluateMonthlyImportLockState/);
  assert.match(undoBlock, /readMonthlyImportLockInTx|evaluateMonthlyImportLockState/);
  // Lock gate must appear inside runTransaction for assignment.
  assert.match(assignBlock, /runTransaction[\s\S]*readMonthlyImportLockInTx|runTransaction[\s\S]*evaluateMonthlyImportLockState/);
});

test("A.3.1 source: incident resolve checks import locks in same tx", () => {
  const idx = routesSrc.indexOf('app.put("/api/staff/operational-incidents/:reportId/resolve"');
  const block = routesSrc.slice(idx, idx + 20000);
  assert.match(block, /readMonthlyImportLockInTx|evaluateMonthlyImportLockState/);
  assert.match(block, /runTransaction[\s\S]*readMonthlyImportLockInTx|runTransaction[\s\S]*evaluateMonthlyImportLockState/);
});

test("A.3.1 source: driver confirmation is transactional + rejects stale fingerprint always", () => {
  const idx = routesSrc.indexOf('app.post("/api/driver/shift-confirmations"');
  const block = routesSrc.slice(idx, idx + 3500);
  assert.match(block, /runTransaction/);
  // Old bug: only rejected stale when already confirmed — must not remain.
  assert.doesNotMatch(
    block,
    /live\.shiftFingerprint !== target\?\.fingerprint\s*\n?\s*&&\s*live\.confirmedByDriver === true/
  );
  // Must not merge-create phantom shift when live missing.
  assert.match(block, /CONFIRMATION_STALE|SHIFT_MISSING|no_live_shift|!live/);
});

test("A.3.1 schema guard: still no lease fields in production", () => {
  for (const banned of [
    "attemptId",
    "leaseExpiresAt",
    "activeAttemptId",
    "wasCommitting",
    "ATTEMPT_LEASE_MS"
  ]) {
    assert.equal(staffSrc.includes(banned), false, banned);
    assert.equal(groupSrc.includes(banned), false, banned);
  }
});
