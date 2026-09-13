"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BLOCK,
  WARN,
  evaluateReplacementEligibility,
  listEligibleReplacementDrivers,
  compareReplacementRanking,
  auditEligibilitySnapshot,
  addDays
} = require("../../js/dispatcher/replacement-eligibility.cjs");

const TZ = "Europe/Vienna";

function candidate(overrides = {}) {
  return {
    id: "drv-a",
    name: "Ana Eligible",
    companyId: "co-a",
    groupId: "310",
    lineId: "310",
    knownGroupIds: ["310"],
    active: true,
    codeActivated: true,
    postalCode: "1010",
    ...overrides
  };
}

function baseInput(overrides = {}) {
  return {
    tenantId: "co-a",
    originalDriverId: "drv-orig",
    targetGroupId: "310",
    targetShift: { date: "2026-09-15", type: "morning", start: "05:00", end: "13:00" },
    timezone: TZ,
    referencePostalCode: "1010",
    shifts: [],
    schedules: [],
    absences: [],
    candidate: candidate(),
    ...overrides
  };
}

function codes(evaluation) {
  return (evaluation.hardBlocks || []).map((row) => row.code);
}

test("fully valid candidate is eligible", () => {
  const evaluation = evaluateReplacementEligibility(baseInput());
  assert.equal(evaluation.eligible, true);
  assert.deepEqual(evaluation.hardBlocks, []);
});

test("mixed schedules and absences do not leak another driver's duties", () => {
  const otherMonth = "2026-09";
  const listed = listEligibleReplacementDrivers({
    ...baseInput(),
    candidate: undefined,
    drivers: [candidate(), candidate({ id: "drv-b", name: "Ben Busy", postalCode: "1020" })],
    shifts: [],
    absences: [
      { driverId: "drv-b", status: "approved", start: "2026-09-15", end: "2026-09-15" }
    ],
    schedules: [
      {
        id: "drv-b_2026-09",
        driverId: "drv-b",
        month: otherMonth,
        parsedShifts: { 15: { type: "morning", start: "05:00", end: "13:00" } }
      }
    ]
  });
  assert.deepEqual(listed.map((row) => row.id), ["drv-a"]);
});

test("unknown group is a hard block", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    candidate: candidate({ groupId: "105", lineId: "105", knownGroupIds: ["105"] })
  }));
  assert.equal(evaluation.eligible, false);
  assert.ok(codes(evaluation).includes(BLOCK.UNKNOWN_GROUP));
});

test("codeActivated false is a hard block", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    candidate: candidate({ codeActivated: false })
  }));
  assert.equal(evaluation.eligible, false);
  assert.ok(codes(evaluation).includes(BLOCK.DRIVER_NOT_ACTIVATED));
});

test("codeActivated must be strictly true; undefined null and string are blocked", () => {
  for (const value of [undefined, null, "true", "yes", 1]) {
    const evaluation = evaluateReplacementEligibility(baseInput({
      candidate: candidate({ codeActivated: value })
    }));
    assert.equal(evaluation.eligible, false, String(value));
    assert.ok(codes(evaluation).includes(BLOCK.DRIVER_NOT_ACTIVATED), String(value));
  }
  const missing = candidate();
  delete missing.codeActivated;
  const evaluation = evaluateReplacementEligibility(baseInput({ candidate: missing }));
  assert.equal(evaluation.eligible, false);
  assert.ok(codes(evaluation).includes(BLOCK.DRIVER_NOT_ACTIVATED));
});

test("existing activated profile remains eligible", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    candidate: candidate({ codeActivated: true })
  }));
  assert.equal(evaluation.eligible, true);
  assert.equal(evaluation.ranking.knowsTarget, true);
});

test("inactive driver is a hard block", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    candidate: candidate({ active: false })
  }));
  assert.equal(evaluation.eligible, false);
  assert.ok(codes(evaluation).includes(BLOCK.DRIVER_INACTIVE));
});

test("approved leave date bounds are inclusive; day before and after are not blocked", () => {
  const before = evaluateReplacementEligibility(baseInput({
    absences: [{ driverId: "drv-a", status: "approved", start: "2026-09-14", end: "2026-09-14" }]
  }));
  assert.equal(before.eligible, true);
  const after = evaluateReplacementEligibility(baseInput({
    absences: [{ driverId: "drv-a", status: "approved", start: "2026-09-16", end: "2026-09-16" }]
  }));
  assert.equal(after.eligible, true);
  const spanning = evaluateReplacementEligibility(baseInput({
    absences: [{ driverId: "drv-a", status: "approved", start: "2026-09-14", end: "2026-09-16" }]
  }));
  assert.ok(codes(spanning).includes(BLOCK.APPROVED_ABSENCE));
  const onStart = evaluateReplacementEligibility(baseInput({
    absences: [{ driverId: "drv-a", status: "approved", start: "2026-09-15", end: "2026-09-18" }]
  }));
  assert.ok(codes(onStart).includes(BLOCK.APPROVED_ABSENCE));
  const onEnd = evaluateReplacementEligibility(baseInput({
    absences: [{ driverId: "drv-a", status: "approved", start: "2026-09-10", end: "2026-09-15" }]
  }));
  assert.ok(codes(onEnd).includes(BLOCK.APPROVED_ABSENCE));
});

test("owner-less absence does not apply to every driver", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    absences: [{ status: "approved", start: "2026-09-15", end: "2026-09-15" }]
  }));
  assert.equal(evaluation.eligible, true);
});

test("pending overlapping absence is a warning, not a hard block", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    absences: [{ driverId: "drv-a", status: "pending", start: "2026-09-15", end: "2026-09-15" }]
  }));
  assert.equal(evaluation.eligible, true);
  assert.equal(evaluation.warnings[0].code, WARN.PENDING_ABSENCE);
});

test("working duty on the target date is an overlap hard block", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    shifts: [{ driverId: "drv-a", date: "2026-09-15", type: "afternoon", start: "14:00", end: "22:00" }]
  }));
  assert.equal(evaluation.eligible, false);
  assert.ok(codes(evaluation).includes(BLOCK.DUTY_OVERLAP));
});

test("10h59 rest before is blocked; exactly 11h before is eligible", () => {
  const short = evaluateReplacementEligibility(baseInput({
    shifts: [{ driverId: "drv-a", date: "2026-09-14", type: "afternoon", start: "10:00", end: "18:01" }]
  }));
  assert.equal(short.eligible, false);
  assert.ok(codes(short).includes(BLOCK.REST_BEFORE_INSUFFICIENT));
  assert.equal(short.restBeforeMinutes, 10 * 60 + 59);

  const exact = evaluateReplacementEligibility(baseInput({
    shifts: [{ driverId: "drv-a", date: "2026-09-14", type: "afternoon", start: "10:00", end: "18:00" }]
  }));
  assert.equal(exact.eligible, true);
  assert.equal(exact.restBeforeMinutes, 11 * 60);
});

test("10h59 rest after is blocked; exactly 11h after is eligible", () => {
  const short = evaluateReplacementEligibility(baseInput({
    targetShift: { date: "2026-09-15", type: "morning", start: "05:00", end: "13:01" },
    shifts: [{ driverId: "drv-a", date: "2026-09-16", type: "morning", start: "00:00", end: "08:00" }]
  }));
  assert.equal(short.eligible, false);
  assert.ok(codes(short).includes(BLOCK.REST_AFTER_INSUFFICIENT));
  assert.equal(short.restAfterMinutes, 10 * 60 + 59);

  const exact = evaluateReplacementEligibility(baseInput({
    targetShift: { date: "2026-09-15", type: "morning", start: "05:00", end: "13:00" },
    shifts: [{ driverId: "drv-a", date: "2026-09-16", type: "morning", start: "00:00", end: "08:00" }]
  }));
  assert.equal(exact.eligible, true);
  assert.equal(exact.restAfterMinutes, 11 * 60);
});

test("missing target times hard-block rest confirmation", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    targetShift: { date: "2026-09-15", type: "morning", start: "", end: "" }
  }));
  assert.equal(evaluation.eligible, false);
  assert.ok(codes(evaluation).includes(BLOCK.REST_TIMES_UNKNOWN));
});

test("overnight duty uses next-day end for rest after", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    targetShift: { date: "2026-09-15", type: "night", start: "22:00", end: "06:00" },
    shifts: [{ driverId: "drv-a", date: "2026-09-16", type: "morning", start: "17:00", end: "21:00" }]
  }));
  assert.equal(evaluation.eligible, true);
  assert.equal(evaluation.restAfterMinutes, 11 * 60);
});

test("nearest previous and next duties are chosen among several, including overnight", () => {
  const morning = evaluateReplacementEligibility(baseInput({
    shifts: [
      { driverId: "drv-a", date: "2026-09-12", type: "morning", start: "05:00", end: "13:00" },
      { driverId: "drv-a", date: "2026-09-14", type: "afternoon", start: "10:00", end: "18:00" },
      { driverId: "drv-a", date: "2026-09-16", type: "morning", start: "00:00", end: "08:00" },
      { driverId: "drv-a", date: "2026-09-17", type: "afternoon", start: "14:00", end: "22:00" }
    ]
  }));
  assert.equal(morning.restBeforeMinutes, 11 * 60);
  assert.equal(morning.restAfterMinutes, 11 * 60);
  assert.equal(morning.eligible, true);

  const night = evaluateReplacementEligibility(baseInput({
    targetShift: { date: "2026-09-15", type: "night", start: "22:00", end: "06:00" },
    shifts: [
      { driverId: "drv-a", date: "2026-09-12", type: "morning", start: "05:00", end: "13:00" },
      { driverId: "drv-a", date: "2026-09-14", type: "afternoon", start: "10:00", end: "18:00" },
      { driverId: "drv-a", date: "2026-09-16", type: "morning", start: "17:00", end: "21:00" },
      { driverId: "drv-a", date: "2026-09-17", type: "afternoon", start: "14:00", end: "22:00" }
    ]
  }));
  assert.equal(night.restBeforeMinutes, 28 * 60);
  assert.equal(night.restAfterMinutes, 11 * 60);
  assert.equal(night.eligible, true);
});

test("previous overnight across midnight is the nearest rest-before window", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    shifts: [
      { driverId: "drv-a", date: "2026-09-12", type: "morning", start: "05:00", end: "13:00" },
      { driverId: "drv-a", date: "2026-09-13", type: "night", start: "22:00", end: "06:00" },
      { driverId: "drv-a", date: "2026-09-16", type: "morning", start: "00:00", end: "08:00" },
      { driverId: "drv-a", date: "2026-09-17", type: "afternoon", start: "14:00", end: "22:00" }
    ]
  }));
  assert.equal(evaluation.restBeforeMinutes, 23 * 60);
  assert.equal(evaluation.restAfterMinutes, 11 * 60);
  assert.equal(evaluation.eligible, true);
});

test("DST spring-forward measures elapsed rest, not wall-clock", () => {
  const short = evaluateReplacementEligibility(baseInput({
    timezone: TZ,
    targetShift: { date: "2026-03-29", type: "morning", start: "09:00", end: "17:00" },
    shifts: [{ driverId: "drv-a", date: "2026-03-28", type: "night", start: "14:00", end: "22:00" }]
  }));
  assert.equal(short.eligible, false);
  assert.ok(codes(short).includes(BLOCK.REST_BEFORE_INSUFFICIENT));

  const ok = evaluateReplacementEligibility(baseInput({
    timezone: TZ,
    targetShift: { date: "2026-03-29", type: "morning", start: "10:00", end: "18:00" },
    shifts: [{ driverId: "drv-a", date: "2026-03-28", type: "night", start: "14:00", end: "22:00" }]
  }));
  assert.equal(ok.eligible, true);
});

test("ranking prefers known target, then home group, then larger rest reserve, then name", () => {
  const listed = listEligibleReplacementDrivers({
    ...baseInput({ candidate: undefined }),
    drivers: [
      candidate({ id: "drv-far", name: "Zed Far", groupId: "105", knownGroupIds: ["105", "310"] }),
      candidate({ id: "drv-mia", name: "Mia Home" }),
      candidate({ id: "drv-ana", name: "Ana Home" })
    ]
  });
  assert.deepEqual(listed.map((row) => row.id), ["drv-ana", "drv-mia", "drv-far"]);
  assert.equal(listed[0].ranking.sameHomeGroup, true);
  assert.equal(Object.prototype.hasOwnProperty.call(listed[0].ranking, "samePlz"), false);
});

test("cross-tenant leave and shift do not affect eligibility", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    absences: [{
      driverId: "drv-a",
      companyId: "co-b",
      status: "approved",
      start: "2026-09-15",
      end: "2026-09-15"
    }],
    shifts: [{
      driverId: "drv-a",
      companyId: "co-b",
      date: "2026-09-15",
      type: "afternoon",
      start: "14:00",
      end: "22:00"
    }]
  }));
  assert.equal(evaluation.eligible, true);
});

test("audit snapshot and ranking have codes and rest minutes, never credentials or PII", () => {
  const evaluation = evaluateReplacementEligibility(baseInput({
    candidate: candidate({
      pin: "9999",
      loginCodeHash: "abc",
      activationOtp: "123456",
      eid: "EID-SECRET-4711",
      email: "ana@secret.test",
      phone: "+431234567"
    })
  }));
  const audit = auditEligibilitySnapshot(evaluation);
  const blob = JSON.stringify({ audit, ranking: evaluation.ranking, blocks: evaluation.hardBlocks });
  assert.equal(audit.eligible, true);
  assert.equal(Object.prototype.hasOwnProperty.call(audit, "samePlz"), false);
  assert.doesNotMatch(blob, /9999|abc|123456|EID-SECRET|ana@secret|431234567|loginCodeHash|activationOtp/i);
});

test("same driver and wrong tenant are hard blocks", () => {
  const same = evaluateReplacementEligibility(baseInput({ originalDriverId: "drv-a" }));
  assert.ok(codes(same).includes(BLOCK.SAME_DRIVER));
  const tenant = evaluateReplacementEligibility(baseInput({
    candidate: candidate({ companyId: "co-b" })
  }));
  assert.ok(codes(tenant).includes(BLOCK.WRONG_TENANT));
});

test("radar and modal share one candidate list; eligibility copy lives in a locale module", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const dash = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/dashboard.js"), "utf8");
  const attn = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/ops-attention.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  const i18n = fs.readFileSync(path.join(__dirname, "../../translations.js"), "utf8");
  const contract = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/replacement-eligibility.cjs"), "utf8");
  const copy = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/replacement-eligibility-i18n.cjs"), "utf8");
  assert.match(dash, /listCoverageReplacementCandidates/);
  assert.match(dash, /listCoverageReplacementCandidates\(report\)/);
  assert.match(attn, /function listCoverageReplacementCandidates\(report\)/);
  assert.match(attn, /replacementRankLabel/);
  assert.match(attn, /eligibilityUiText\("no_candidates"\)/);
  assert.match(attn, /replacement-eligibility-i18n\.cjs/);
  assert.match(routes, /require\("\.\.\/js\/dispatcher\/replacement-eligibility\.cjs"\)/);
  assert.match(attn, /replacement-eligibility\.cjs/);
  assert.doesNotMatch(i18n, /ops_elig_/);
  assert.doesNotMatch(contract, /No eligible replacement for this duty\./);
  assert.match(copy, /No eligible replacement for this duty\./);
  assert.match(copy, /Kein geeigneter Ersatz für diese Schicht\./);
  assert.match(copy, /Nema podobnog vozača za ovu smenu\./);
  assert.doesNotMatch(attn, /home group|same PLZ|pending leave|knows line|rest \$\{/);
});

test("server and UI share the same block codes from one evaluator", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const attn = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/ops-attention.js"), "utf8");
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(attn, /evaluateReplacementEligibility\(/);
  assert.match(routes, /evaluateReplacementEligibility\(/);
  assert.match(routes, /error\.blocks = \(eligibility\.hardBlocks \|\| \[\]\)\.map\(\(row\) => row\.code\)/);
  const blocked = evaluateReplacementEligibility(baseInput({
    candidate: candidate({ codeActivated: false, groupId: "105", knownGroupIds: ["105"] })
  }));
  assert.deepEqual(new Set(codes(blocked)), new Set([BLOCK.DRIVER_NOT_ACTIVATED, BLOCK.UNKNOWN_GROUP]));
});

test("compareReplacementRanking prefers larger rest, then name, never PLZ", () => {
  const left = { ranking: { knowsTarget: true, sameHomeGroup: true, restReserveMinutes: 800, nameKey: "Ana", driverId: "a" } };
  const right = { ranking: { knowsTarget: true, sameHomeGroup: true, restReserveMinutes: 900, nameKey: "Ben", driverId: "b" } };
  assert.ok(compareReplacementRanking(left, right) > 0);
  assert.equal(addDays("2026-09-15", 1), "2026-09-16");
});

test("Firestore vacation reads are tenant-scoped driverId+end queries with a composite index", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  const start = routes.indexOf('app.put("/api/staff/operational-incidents/:reportId/resolve"');
  const end = routes.indexOf('app.get("/api/staff/shift-confirmations"', start);
  const route = routes.slice(start, end);
  const indexes = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8"));
  assert.match(route, /companyRef\.collection\("vacations"\)\s*\.where\("driverId", "==", parsed\.data\.replacementDriverId\)\s*\.where\("end", ">=", date\)/);
  assert.doesNotMatch(route, /collection\("vacations"\)[\s\S]*\.limit\(/);
  assert.match(route, /const vacationSnapLive = await tx\.get\(vacationQuery\)/);
  assert.match(route, /companyRef\.collection\("shifts"\)\.doc\(shiftDocumentId\(parsed\.data\.replacementDriverId, item\)\)/);
  assert.match(route, /neighborDates\(date\)/);
  const liveVacationGet = route.indexOf("const vacationSnapLive = await tx.get(vacationQuery);");
  const dutyGuardGet = route.indexOf("const dutyGuardSnap = dutyGuardDocRef ? await tx.get(dutyGuardDocRef) : null;");
  const firstWrite = route.indexOf("tx.delete(gate.lockRef)");
  assert.ok(dutyGuardGet > 0 && liveVacationGet > dutyGuardGet && firstWrite > liveVacationGet);
  const vacationIndexes = (indexes.indexes || []).filter((row) => row.collectionGroup === "vacations");
  assert.equal(vacationIndexes.length, 1);
  assert.deepEqual(vacationIndexes[0].fields.map((row) => row.fieldPath), ["driverId", "end"]);
  assert.equal(vacationIndexes[0].queryScope, "COLLECTION");
});
