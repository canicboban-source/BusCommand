import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
    location: { hostname: "localhost", search: "" },
    TRANSLATIONS: { en: {}, sr: {}, de: {} },
    state: {
        language: "en",
        activeLineId: "310",
        activeGroupHubId: "",
        activeGroupFilter: "",
        groups: [{ id: "310" }],
        drivers: [
            { name: "Driver Rest OK", groupId: "310", active: true },
            { name: "Driver Rest Short", groupId: "310", active: true },
            { name: "Driver Off Yesterday", groupId: "310", active: true },
            { name: "Driver No Data", groupId: "310", active: true }
        ],
        shifts: [
            // OK: 12h rest — ends 20:00 yesterday, starts 08:00 today (12h gap)
            { driverName: "Driver Rest OK", date: "2026-08-16", type: "afternoon", start: "12:00", end: "20:00", revision: 0 },
            { driverName: "Driver Rest OK", date: "2026-08-17", type: "morning", start: "08:00", end: "16:00", revision: 0 },
            // Violation: ends 23:00 yesterday, starts 05:00 today (6h gap)
            { driverName: "Driver Rest Short", date: "2026-08-16", type: "night", start: "15:00", end: "23:00", revision: 0 },
            { driverName: "Driver Rest Short", date: "2026-08-17", type: "morning", start: "05:00", end: "13:00", revision: 0 },
            // Off yesterday, driving today — should not flag (off is not a driving type)
            { driverName: "Driver Off Yesterday", date: "2026-08-16", type: "off", revision: 0 },
            { driverName: "Driver Off Yesterday", date: "2026-08-17", type: "morning", start: "05:00", end: "13:00", revision: 0 }
            // Driver No Data: intentionally has no shifts at all
        ]
    }
};

const { collectRestPeriodAttentionItems } = await import("../../js/dispatcher/ops-attention.js");

test("flags driver with less than 11h rest between consecutive driving shifts", () => {
    const items = collectRestPeriodAttentionItems("310", "2026-08-17");
    const short = items.find((i) => i.driverName === "Driver Rest Short");
    assert.ok(short, "expected a rest violation for Driver Rest Short");
    assert.equal(short.kind, "rest_period_violation");
    assert.ok(short.restHours < 11, `expected < 11h, got ${short.restHours}`);
});

test("does not flag driver with sufficient rest", () => {
    const items = collectRestPeriodAttentionItems("310", "2026-08-17");
    const ok = items.find((i) => i.driverName === "Driver Rest OK");
    assert.equal(ok, undefined);
});

test("does not flag when previous day was off/vacation/sick", () => {
    const items = collectRestPeriodAttentionItems("310", "2026-08-17");
    const offDriver = items.find((i) => i.driverName === "Driver Off Yesterday");
    assert.equal(offDriver, undefined);
});

test("does not flag driver with no shift data", () => {
    const items = collectRestPeriodAttentionItems("310", "2026-08-17");
    const noData = items.find((i) => i.driverName === "Driver No Data");
    assert.equal(noData, undefined);
});
