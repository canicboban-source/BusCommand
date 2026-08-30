import test from "node:test";
import assert from "node:assert/strict";

// Setup browser globals for client ESM module imports
globalThis.window = {
    location: { hostname: "localhost", search: "" },
    TRANSLATIONS: {
        en: {
            ops_attn_inactive_bus_title: "Inactive bus",
            ops_attn_inactive_bus_summary: "Bus {busNumber} is inactive. Pick another bus.",
            ops_attn_pick_replacement_bus: "Pick another bus",
            ops_bus_inactive_badge: "inactive",
            ops_bus_inactive_warn: "Bus {bus} is inactive"
        },
        sr: {
            ops_attn_inactive_bus_title: "Neaktivan autobus",
            ops_attn_inactive_bus_summary: "Autobus {busNumber} je neaktivan. Izaberi drugi autobus.",
            ops_attn_pick_replacement_bus: "Izaberi drugi autobus",
            ops_bus_inactive_badge: "neaktivan",
            ops_bus_inactive_warn: "Autobus {bus} je neaktivan"
        },
        de: {
            ops_attn_inactive_bus_title: "Inaktiver Bus",
            ops_attn_inactive_bus_summary: "Bus {busNumber} ist inaktiv. Wählen Sie einen anderen Bus.",
            ops_attn_pick_replacement_bus: "Anderen Bus wählen",
            ops_bus_inactive_badge: "inaktiv",
            ops_bus_inactive_warn: "Bus {bus} ist inaktiv"
        }
    },
    state: {
        language: "sr",
        activeLineId: "310",
        activeGroupHubId: "310",
        activeGroupFilter: "310",
        groups: [{ id: "310", name: "Linija 310", color: "#3b82f6" }],
        buses: [
            { number: "91501", active: true, opsStatus: "active", groupIds: ["310"], garage: "Depot A" },
            { number: "91502", active: true, opsStatus: "reserve", groupIds: ["310"], garage: "Depot A" },
            { number: "91503", active: false, opsStatus: "active", groupIds: ["310"], garage: "Depot A" },
            { number: "91504", active: true, opsStatus: "breakdown", groupIds: ["310"], garage: "Depot A" },
            { number: "91505", active: true, opsStatus: "other_line", groupIds: ["310"], garage: "Depot A" }
        ],
        drivers: [
            { id: "drv-1", name: "Marko Marković", groupId: "310", active: true },
            { id: "drv-2", name: "Jovan Jovanović", groupId: "310", active: true }
        ],
        shifts: [
            { driverId: "drv-1", driverName: "Marko Marković", date: "2026-08-29", type: "morning", routeCode: "310.101", bus: "91504", revision: 0 },
            { driverId: "drv-2", driverName: "Jovan Jovanović", date: "2026-08-29", type: "morning", routeCode: "310.102", bus: "91501", revision: 0 }
        ]
    }
};

const { collectInactiveBusAttentionItems } = await import("../../js/dispatcher/ops-attention.js");
const { evaluateBusResource } = await import("../../server/assignment-resource-guard.js");

test("A. Inactive or non-assignable buses are excluded from normal bus options", async () => {
    const { busOptions } = await import("../../js/dispatcher/daily-plan.js");
    const html = busOptions("");
    // Active (91501) and Reserve (91502) should be present
    assert.ok(html.includes('value="91501"'), "Active bus 91501 should be selectable");
    assert.ok(html.includes('value="91502"'), "Reserve bus 91502 should be selectable");
    // Inactive (91503), Breakdown (91504), Other line (91505) should NOT be offered as new options
    assert.ok(!html.includes('value="91503"'), "Inactive bus 91503 must not be selectable");
    assert.ok(!html.includes('value="91504"'), "Breakdown bus 91504 must not be selectable");
    assert.ok(!html.includes('value="91505"'), "Other line bus 91505 must not be selectable");
});

test("B. Non-assignable bus is not offered in replacement selectors (freeBusPools & coverageBusCandidates)", async () => {
    const { coverageBusCandidates } = await import("../../js/dispatcher/dashboard.js");
    const candidates = coverageBusCandidates({ groupId: "310", driverId: "drv-1", date: "2026-08-29", bus: "91504" });
    const candidateNumbers = candidates.map(b => String(b.number));
    assert.ok(!candidateNumbers.includes("91503"), "Inactive bus 91503 must not be in replacement candidates");
    assert.ok(!candidateNumbers.includes("91504"), "Breakdown bus 91504 must not be in replacement candidates even if keepBus");
    assert.ok(!candidateNumbers.includes("91505"), "Other line bus 91505 must not be in replacement candidates");
});

test("C. Inactive current bus is displayed as existing assignment context, but is disabled and not selectable as replacement", async () => {
    const { busOptions } = await import("../../js/dispatcher/daily-plan.js");
    const html = busOptions("91504");
    // 91504 is assigned, so it appears disabled as context
    assert.ok(html.includes('value="91504" selected disabled'), "Current assigned inactive bus 91504 should be selected disabled");
    assert.ok(html.includes('neaktivan'), "Should show inactive badge label");
});

test("D. Already-assigned bus that becomes inactive generates a critical attention item with exact Serbian summary", () => {
    const items = collectInactiveBusAttentionItems("310", "2026-08-29");
    const item = items.find(i => i.bus === "91504" && i.driverId === "drv-1");
    assert.ok(item, "Expected a critical attention item for bus 91504");
    assert.equal(item.severity, "critical");
    assert.equal(item.kind, "inactive_bus");
    assert.equal(item.bus, "91504");
    assert.equal(item.driverName, "Marko Marković");
    assert.equal(item.summary, "Autobus 91504 je neaktivan. Izaberi drugi autobus.");
    // Replacement candidate pools for this item must only contain assignable buses
    const poolBuses = (item.busPools?.all || []).map(b => b.number);
    assert.ok(!poolBuses.includes("91503"), "Pool must not include inactive bus 91503");
    assert.ok(!poolBuses.includes("91504"), "Pool must not include breakdown bus 91504");
    assert.ok(!poolBuses.includes("91505"), "Pool must not include other line bus 91505");
});

test("E. Attention item disappears when a valid replacement bus is assigned", () => {
    // Reassign drv-1 to reserve bus 91502
    window.state.shifts = [
        { driverId: "drv-1", driverName: "Marko Marković", date: "2026-08-29", type: "morning", routeCode: "310.101", bus: "91502", revision: 1 },
        { driverId: "drv-2", driverName: "Jovan Jovanović", date: "2026-08-29", type: "morning", routeCode: "310.102", bus: "91501", revision: 0 }
    ];
    const items = collectInactiveBusAttentionItems("310", "2026-08-29");
    const item = items.find(i => i.driverId === "drv-1");
    assert.equal(item, undefined, "Attention item should disappear once replacement bus 91502 is assigned");
});

test("F. Attention item disappears if the same bus becomes assignable again", () => {
    // Reset shift back to 91504 and set bus 91504 back to active
    window.state.shifts = [
        { driverId: "drv-1", driverName: "Marko Marković", date: "2026-08-29", type: "morning", routeCode: "310.101", bus: "91504", revision: 1 },
        { driverId: "drv-2", driverName: "Jovan Jovanović", date: "2026-08-29", type: "morning", routeCode: "310.102", bus: "91501", revision: 0 }
    ];
    const bus91504 = window.state.buses.find(b => b.number === "91504");
    bus91504.opsStatus = "active"; // Bus repaired and active

    const items = collectInactiveBusAttentionItems("310", "2026-08-29");
    const item = items.find(i => i.driverId === "drv-1");
    assert.equal(item, undefined, "Attention item should disappear once bus 91504 is repaired and active");
});

test("G. Existing server/preflight BUS_INACTIVE and BUS_NOT_AVAILABLE guards remain functional", () => {
    const busesMap = new Map([
        ["91501", { number: "91501", active: true, opsStatus: "active", groupIds: ["310"] }],
        ["91502", { number: "91502", active: true, opsStatus: "reserve", groupIds: ["310"] }],
        ["91503", { number: "91503", active: false, opsStatus: "active", groupIds: ["310"] }],
        ["91504", { number: "91504", active: true, opsStatus: "breakdown", groupIds: ["310"] }],
        ["91505", { number: "91505", active: true, opsStatus: "other_line", groupIds: ["310"] }]
    ]);

    const resInactive = evaluateBusResource({
        bus: busesMap.get("91503"),
        busNumber: "91503",
        groupId: "310",
        existingBusNumber: ""
    });
    assert.equal(resInactive.ok, false);
    assert.equal(resInactive.code, "BUS_INACTIVE");

    const resBreakdown = evaluateBusResource({
        bus: busesMap.get("91504"),
        busNumber: "91504",
        groupId: "310",
        existingBusNumber: ""
    });
    assert.equal(resBreakdown.ok, false);
    assert.equal(resBreakdown.code, "BUS_NOT_AVAILABLE");

    const resActive = evaluateBusResource({
        bus: busesMap.get("91501"),
        busNumber: "91501",
        groupId: "310",
        existingBusNumber: ""
    });
    assert.equal(resActive.ok, true);
});

test("H. Existing duty-instance uniqueness guards do not regress", async () => {
    const { canonicalDutyGuardKey, evaluateDutyGuardClaim } = await import("../../server/duty-instance-guard.js");
    const key = canonicalDutyGuardKey({ groupId: "310", serviceDate: "2026-08-29", dutyCode: "310.101" });
    assert.match(key, /^v1_[a-f0-9]{64}$/);

    const claim1 = evaluateDutyGuardClaim({
        guardData: null,
        driverId: "drv-1",
        driverName: "Marko Marković",
        shiftDocumentId: "drv-1_2026-08-29",
        date: "2026-08-29",
        groupId: "310",
        dutyCode: "310.101"
    });
    assert.equal(claim1.ok, true);
    assert.equal(claim1.isNew, true);

    const activeGuard = {
        schemaVersion: "v1",
        companyId: "c-acme",
        groupId: "310",
        serviceDate: "2026-08-29",
        dutyCode: "310.101",
        ownerDriverId: "drv-1",
        ownerShiftDocumentId: "drv-1_2026-08-29",
        revision: 1
    };

    const claimConflict = evaluateDutyGuardClaim({
        guardData: activeGuard,
        driverId: "drv-2",
        driverName: "Jovan Jovanović",
        shiftDocumentId: "drv-2_2026-08-29",
        date: "2026-08-29",
        groupId: "310",
        dutyCode: "310.101"
    });
    assert.equal(claimConflict.ok, false);
    assert.equal(claimConflict.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(claimConflict.conflict.existingDriverId, "drv-1");
});
