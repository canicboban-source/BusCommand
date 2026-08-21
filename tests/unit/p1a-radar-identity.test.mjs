/**
 * P1-A regression: authoritative driver-ID matching + 3-day operational
 * radar window, using the real ops-attention.js module against a synthetic
 * in-memory window.state (no browser/emulator needed for these pure-logic
 * assertions — the live emulator+UI proof is separate).
 */
import test from "node:test";
import assert from "node:assert/strict";

// Matches exactly what operationalTodayDateStr("UTC") computes at runtime,
// so these fixtures stay correct on any real calendar day the suite runs on
// (never hard-coded to a specific date).
function realTodayUtc() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function isoPlus(dateStr, days) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function makeWindow({ drivers, shifts, timezone = "UTC", country = null, currentUser = null }) {
    return {
        location: { hostname: "localhost", search: "" },
        TRANSLATIONS: { en: {}, sr: {}, de: {} },
        currentUser,
        state: {
            language: "en",
            activeLineId: "310",
            activeGroupHubId: "310",
            activeGroupFilter: "310",
            groups: [{ id: "310" }],
            profile: timezone ? { timezone, country } : {},
            drivers,
            shifts
        }
    };
}

async function loadOpsAttention(win) {
    globalThis.window = win;
    // Force a fresh module instance per test so different window.state fixtures
    // do not bleed into each other via ESM's module cache.
    const mod = await import(`../../js/dispatcher/ops-attention.js?t=${Date.now()}-${Math.random()}`);
    return mod;
}

test("duplicate names: covering Driver A never covers Driver B (D0)", async () => {
    const today = realTodayUtc();
    const win = makeWindow({
        today,
        drivers: [
            { id: "drv-a", name: "Marko Jovanović", groupId: "310", active: true },
            { id: "drv-b", name: "Marko Jovanović", groupId: "310", active: true }
        ],
        shifts: [
            { driverId: "drv-a", driverName: "Marko Jovanović", date: today, type: "morning", name: "310.S01", start: "05:00", end: "13:00", revision: 1 }
        ]
    });
    const { collectPlanGapAttentionItems } = await loadOpsAttention(win);
    const items = collectPlanGapAttentionItems("310", today);
    const flaggedIds = items.filter((i) => i.kind === "plan_gap_driver").map((i) => i.driverId);
    assert.deepEqual(flaggedIds, ["drv-b"], "only the genuinely uncovered driver-b must be flagged");
});

test("covering Driver B on D0 removes only Driver B's D0 warning", async () => {
    const today = realTodayUtc();
    const win = makeWindow({
        today,
        drivers: [
            { id: "drv-a", name: "Marko Jovanović", groupId: "310", active: true },
            { id: "drv-b", name: "Marko Jovanović", groupId: "310", active: true }
        ],
        shifts: [
            { driverId: "drv-a", driverName: "Marko Jovanović", date: today, type: "morning", name: "310.S01", start: "05:00", end: "13:00", revision: 1 },
            { driverId: "drv-b", driverName: "Marko Jovanović", date: today, type: "morning", name: "310.S02", start: "13:00", end: "21:00", revision: 1 }
        ]
    });
    const { collectPlanGapAttentionItems } = await loadOpsAttention(win);
    const items = collectPlanGapAttentionItems("310", today);
    assert.equal(items.filter((i) => i.kind === "plan_gap_driver").length, 0);
});

test("D+1 gap is detected as a correctly-dated D+1 warning (not D0)", async () => {
    const today = realTodayUtc();
    const tomorrow = isoPlus(today, 1);
    const win = makeWindow({
        today,
        drivers: [{ id: "drv-a", name: "Driver A", groupId: "310", active: true }],
        shifts: [
            { driverId: "drv-a", driverName: "Driver A", date: today, type: "morning", start: "05:00", end: "13:00", revision: 1 }
            // no shift for tomorrow
        ]
    });
    const { collectPlanGapAttentionItems } = await loadOpsAttention(win);
    const d0 = collectPlanGapAttentionItems("310", today);
    const d1 = collectPlanGapAttentionItems("310", tomorrow);
    assert.equal(d0.filter((i) => i.driverId === "drv-a").length, 0, "D0 is covered, no D0 warning");
    const gap = d1.find((i) => i.driverId === "drv-a");
    assert.ok(gap, "expected a D+1 warning");
    assert.equal(gap.date, tomorrow);
});

test("D+2 gap is detected; D-1 does not cover D0; D+3 never enters the radar", async () => {
    const today = realTodayUtc();
    const yesterday = isoPlus(today, -1);
    const dayAfterTomorrow = isoPlus(today, 2);
    const threeDaysOut = isoPlus(today, 3);
    const win = makeWindow({
        today,
        drivers: [{ id: "drv-a", name: "Driver A", groupId: "310", active: true }],
        shifts: [
            { driverId: "drv-a", driverName: "Driver A", date: yesterday, type: "morning", start: "05:00", end: "13:00", revision: 1 }
            // D0, D+1, D+2, D+3 all intentionally have no shift
        ]
    });
    const { collectPlanGapAttentionItems } = await loadOpsAttention(win);
    const d0 = collectPlanGapAttentionItems("310", today);
    const d2 = collectPlanGapAttentionItems("310", dayAfterTomorrow);
    assert.ok(d0.find((i) => i.driverId === "drv-a"), "D-1 coverage must not suppress D0's own gap");
    assert.ok(d2.find((i) => i.driverId === "drv-a"), "D+2 gap must be detected");
    // The radar window helper itself must never include D+3.
    const { collectAllAttentionItems } = await loadOpsAttention(win);
    const all = collectAllAttentionItems("310");
    const datesSeen = new Set(all.map((i) => i.date).filter(Boolean));
    assert.ok(!datesSeen.has(threeDaysOut), "D+3 must never appear in the aggregated radar window");
    assert.ok(!datesSeen.has(yesterday), "D-1 must never appear in the aggregated radar window");
});

test("stable identity = problemType + driverId + operationalDate (no cross-day id collisions)", async () => {
    const today = realTodayUtc();
    const win = makeWindow({
        today,
        drivers: [{ id: "drv-a", name: "Driver A", groupId: "310", active: true }],
        shifts: []
    });
    const { collectAllAttentionItems } = await loadOpsAttention(win);
    const all = collectAllAttentionItems("310");
    const ids = all.filter((i) => i.kind === "plan_gap_driver" && i.driverId === "drv-a").map((i) => i.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicate ids across the 3 radar days");
    assert.equal(ids.length, 3, "driver uncovered on all of D0/D1/D2 must produce exactly 3 distinct dated items");
});

test("missing driverId produces a truthful data-integrity item, never a name-matched guess", async () => {
    const today = realTodayUtc();
    const win = makeWindow({
        today,
        drivers: [{ name: "No Id Driver", groupId: "310", active: true }],
        shifts: []
    });
    const { collectPlanGapAttentionItems } = await loadOpsAttention(win);
    const items = collectPlanGapAttentionItems("310", today);
    const item = items.find((i) => i.driverName === "No Id Driver");
    assert.ok(item, "expected a data-integrity item");
    assert.equal(item.kind, "data_integrity_missing_id");
    assert.equal(item.driverId, null);
});

// NOTE: cross-company isolation is intentionally NOT re-tested at this
// client-side rendering layer. js/data/group-membership.js's
// driverBelongsToLine() explicitly documents "Not a security boundary —
// Firestore Rules + server projection decide Dispo reads": window.state is
// expected to already contain only the authenticated tenant's documents by
// construction of the Firestore sync layer (verified live, server-side, in
// the prior P1-A sub-task with real foreign-company tokens -> 404). A
// synthetic fixture that mixes two companies' drivers into one
// window.state.drivers array does not reflect how the app is actually
// populated, so it is not included here as a P1-A regression.

test("another group's assignments do not influence the active group", async () => {
    const today = realTodayUtc();
    const win = makeWindow({
        today,
        drivers: [
            { id: "drv-a", name: "Driver A", groupId: "310", active: true },
            { id: "drv-x", name: "Driver X", groupId: "999", active: true }
        ],
        shifts: [
            { driverId: "drv-x", driverName: "Driver X", date: today, type: "morning", start: "05:00", end: "13:00", revision: 1 }
        ]
    });
    const { collectPlanGapAttentionItems } = await loadOpsAttention(win);
    const items = collectPlanGapAttentionItems("310", today);
    assert.ok(!items.find((i) => i.driverId === "drv-x"), "foreign group driver must not appear");
    assert.ok(items.find((i) => i.driverId === "drv-a"), "own group's uncovered driver must still appear");
});
