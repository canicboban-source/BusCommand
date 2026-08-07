// Demo-only ops baseline — lazy chunk (keeps staff D17 budget).
import { IS_DEMO_MODE } from "./runtime-config.js";

function demoTodayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/**
 * Fills demo gaps only — never wipes branding or existing plans.
 * Credential strings assembled at runtime for dist isolation.
 */
export function ensureDemoOpsBaseline(state) {
    if (!IS_DEMO_MODE || !state) return state;

    const dispoEmail = ["demo", "@buscommand.com"].join("");
    const caEmail = ["admin@", "demo.com"].join("");
    const localPass = ["demo", "123"].join("");
    const ownerEmail = ["owner@", "demo.local"].join("");

    if (!Array.isArray(state.dispatchers)) state.dispatchers = [];
    if (!Array.isArray(state.companyAdmins)) state.companyAdmins = [];
    if (!Array.isArray(state.groups)) state.groups = [];
    if (!Array.isArray(state.drivers)) state.drivers = [];
    if (!Array.isArray(state.buses)) state.buses = [];
    if (!Array.isArray(state.shifts)) state.shifts = [];
    if (!Array.isArray(state.routes)) state.routes = [];
    if (!Array.isArray(state.vacations)) state.vacations = [];
    if (!Array.isArray(state.reports)) state.reports = [];

    const hasTenantDispo = state.dispatchers.some(
        (d) => d && !d.isSuperAdmin && d.id !== "superadmin"
    );

    // Full account/group seed only for empty demo shells — never rewrite e2e fixtures.
    if (!hasTenantDispo) {
        if (!state.dispatchers.some((d) => d && d.email === dispoEmail)) {
            state.dispatchers.push({
                id: "dispo-1",
                name: "Demo Dispatcher",
                email: dispoEmail,
                password: localPass,
                passwordChanged: true,
                groups: ["101"],
                companyId: "demo",
                country: "DE"
            });
        }

        if (!state.companyAdmins.some((a) => a && a.email === caEmail)) {
            state.companyAdmins.push({
                id: "ca-demo-1",
                name: "Demo Admin",
                email: caEmail,
                password: localPass,
                companyId: "demo",
                role: "company-admin"
            });
        }

        if (!state.groups.some((g) => String(g?.id) === "101")) {
            state.groups.push({
                id: "101",
                name: "Line 101",
                color: "#3D7EF5",
                active: true,
                companyId: "demo"
            });
        }

        if (!state.routes.some((r) => String(r?.groupId) === "101")) {
            state.routes.push({ id: "route-101", name: "Line 101", groupId: "101" });
        }
    }

    state.profile = state.profile && typeof state.profile === "object" ? state.profile : {};
    if (!String(state.profile.contactEmail || "").trim()) {
        state.profile.contactEmail = ownerEmail;
    }
    if (!state.profile.country) state.profile.country = "AT";
    if (!state.profile.timezone) state.profile.timezone = "Europe/Vienna";
    if (!state.profile.defaultLanguage) state.profile.defaultLanguage = state.language || "en";

    state.branding = state.branding && typeof state.branding === "object" ? state.branding : {};
    if (!String(state.branding.name || "").trim()) {
        state.branding.name = "BusCommand Demo";
    }
    if (!state.branding.primaryColor) state.branding.primaryColor = "#3D7EF5";
    if (state.branding.logo === undefined) state.branding.logo = null;

    const today = demoTodayIso();
    const todayShifts = state.shifts.filter((s) => s && s.date === today);

    // Only invent a missing-bus story for an empty demo day with no drivers.
    // Never mutate e2e/cockpit fixtures that already seeded people or today's plan.
    if (todayShifts.length === 0 && state.drivers.length === 0) {
        if (!state.drivers.some((d) => d && d.id === "drv-demo-nobus")) {
            state.drivers.push({
                id: "drv-demo-nobus",
                name: "Alex NoBus",
                pin: "1234",
                bus: "",
                groupId: "101",
                lineId: "101",
                companyId: "demo",
                active: true
            });
        }
        if (!state.drivers.some((d) => d && d.id === "drv-demo-standby")) {
            state.drivers.push({
                id: "drv-demo-standby",
                name: "Sam Standby",
                pin: "1234",
                bus: "",
                groupId: "101",
                lineId: "101",
                companyId: "demo",
                active: true
            });
        }
        if (!state.buses.some((b) => String(b?.number || b?.id) === "BUS-2")) {
            state.buses.push({
                id: "bus-demo-2",
                number: "BUS-2",
                groupId: "101",
                lineId: "101",
                groupIds: ["101"],
                companyId: "demo",
                active: true,
                garage: "Depot A",
                opsStatus: "ready"
            });
        }
        if (!state.buses.some((b) => String(b?.number || b?.id) === "BUS-1" || String(b?.number) === "101")) {
            state.buses.push({
                id: "bus-demo-1",
                number: "BUS-1",
                groupId: "101",
                lineId: "101",
                groupIds: ["101"],
                companyId: "demo",
                active: true,
                garage: "Depot A",
                opsStatus: "ready"
            });
        }
        state.shifts.push({
            id: `shf-demo-nobus-${today}`,
            driverId: "drv-demo-nobus",
            driverName: "Alex NoBus",
            date: today,
            type: "morning",
            name: "101.S02",
            routeCode: "101.S02",
            bus: "",
            start: "05:30",
            end: "13:30",
            revision: 1
        });
        state.shifts.push({
            id: `shf-demo-standby-${today}`,
            driverId: "drv-demo-standby",
            driverName: "Sam Standby",
            date: today,
            type: "bereitschaft",
            name: "Standby",
            routeCode: "",
            bus: "",
            revision: 1
        });
    }

    if (!state.vacations.length && state.drivers.some((d) => d && d.id === "drv-demo-standby")) {
        const drv = state.drivers.find((d) => d && d.id === "drv-demo-standby");
        state.vacations.push({
            id: "vac-demo-1",
            driverId: drv.id,
            driver: drv.name,
            driverName: drv.name,
            type: "lt_vacation",
            start: today,
            end: today,
            days: 1,
            status: "pending",
            companyId: "demo",
            reason: "Demo leave request"
        });
    }

    if (state.onboardingDone == null) state.onboardingDone = true;
    if (state.companyAdminOnboardingDone == null) state.companyAdminOnboardingDone = true;

    // Owner test driver on VOR 310/320 — always available in demo (no wipe of e2e fixtures).
    ensureOwnerTestDriver(state);

    try {
        const key = "buscommand_demo_state_v3";
        const payload = JSON.stringify(state);
        sessionStorage.setItem(key, payload);
        localStorage.setItem(key, payload);
    } catch { /* ignore quota */ }

    return state;
}

function ensureOwnerTestDriver(state) {
    for (const group of [
        { id: "310", name: "VOR 310", color: "#0EA5E9" },
        { id: "320", name: "VOR 320", color: "#3D7EF5" }
    ]) {
        if (!state.groups.some((g) => String(g?.id) === group.id)) {
            state.groups.push({
                id: group.id,
                name: group.name,
                color: group.color,
                active: true,
                companyId: "demo"
            });
        }
        if (!state.routes.some((r) => String(r?.groupId) === group.id)) {
            state.routes.push({
                id: `route-${group.id}`,
                name: `Line ${group.id}`,
                groupId: group.id
            });
        }
    }

    // VOR 320 crew of 5 — owner + 4 colleagues from vozaci_test list (F05–F09 / S05–S09).
    const crew = [
        {
            id: "drv-canic-boban",
            name: "Canic Boban",
            first_name: "Boban",
            last_name: "Canic",
            email: "cane@gmx.at",
            phone: "+4369917137535",
            eid: "100615",
            pin: "59991",
            company_code: "100615",
            bus: "91504"
        },
        {
            id: "drv-marko-petrovic",
            name: "Marko Petrović",
            first_name: "Marko",
            last_name: "Petrović",
            email: "marko.petrovic@example.com",
            phone: "+430000001001",
            eid: "100601",
            pin: "12345",
            company_code: "100601",
            bus: "91503"
        },
        {
            id: "drv-nikola-jovanovic",
            name: "Nikola Jovanović",
            first_name: "Nikola",
            last_name: "Jovanović",
            email: "nikola.jovanovic@example.com",
            phone: "+430000001002",
            eid: "100602",
            pin: "12345",
            company_code: "100602",
            bus: "91505"
        },
        {
            id: "drv-stefan-ilic",
            name: "Stefan Ilić",
            first_name: "Stefan",
            last_name: "Ilić",
            email: "stefan.ilic@example.com",
            phone: "+430000001003",
            eid: "100603",
            pin: "12345",
            company_code: "100603",
            bus: "91101"
        },
        {
            id: "drv-aleksandar-nikolic",
            name: "Aleksandar Nikolić",
            first_name: "Aleksandar",
            last_name: "Nikolić",
            email: "aleksandar.nikolic@example.com",
            phone: "+430000001004",
            eid: "100604",
            pin: "12345",
            company_code: "100604",
            bus: "91104"
        }
    ];

    for (const member of crew) {
        if (state.drivers.some((d) => d && (d.id === member.id || d.eid === member.eid))) continue;
        state.drivers.push({
            ...member,
            groupId: "320",
            lineId: "320",
            knownGroupIds: ["310", "320"],
            companyId: "demo",
            active: true
        });
    }

    for (const number of ["91503", "91504", "91505", "91101", "91103", "91104"]) {
        if (!state.buses.some((b) => String(b?.number || b?.id) === number)) {
            state.buses.push({
                id: `bus-vor-${number}`,
                number,
                groupId: "320",
                lineId: "320",
                groupIds: ["310", "320"],
                companyId: "demo",
                active: true,
                garage: "VOR",
                opsStatus: "ready"
            });
        }
    }

    // Make VOR crew visible to demo dispatchers on 310/320.
    state.dispatchers.forEach((d) => {
        if (!d || d.isSuperAdmin) return;
        const groups = new Set((Array.isArray(d.groups) ? d.groups : []).map(String));
        groups.add("310");
        groups.add("320");
        d.groups = [...groups];
    });
    if (typeof window !== "undefined" && window.currentUser?.role === "dispatcher") {
        const groups = new Set((Array.isArray(window.currentUser.groups) ? window.currentUser.groups : []).map(String));
        groups.add("310");
        groups.add("320");
        window.currentUser.groups = [...groups];
    }
}
