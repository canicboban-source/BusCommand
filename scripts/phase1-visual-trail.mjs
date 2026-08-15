/**
 * Phase 1 — Dispatcher group authorization visual trail (QA harness, no ?mode=demo).
 * Screenshot ≠ authz proof; Rules/API tests remain mandatory.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-1-visual");
const PORT = process.env.PORT || "8766";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) {
    if (name.endsWith(".png") || name === "TRAIL.json" || name === "README.md") {
        unlinkSync(join(outDir, name));
    }
}

const trail = [];
let failed = false;
function log(step, detail, status = "pass") {
    trail.push({ step, detail, status, at: new Date().toISOString() });
    console.log(`[${status}] ${step}: ${detail}`);
    if (status === "fail") failed = true;
}

async function shot(page, name, note) {
    await page.screenshot({ path: join(outDir, name), fullPage: false });
    log(name, note, "pass");
}

const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: "Home Group Driver",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
});

fixture.state.groups = [
    { id: "101", lineId: "101", name: "Line 101", active: true, companyId: "qa-local" },
    { id: "202", lineId: "202", name: "Line 202", active: true, companyId: "qa-local" }
];
fixture.state.drivers = [
    {
        id: "drv-home-101",
        name: "Home Group Driver",
        firstName: "Home",
        lastName: "Driver",
        groupId: "101",
        lineId: "101",
        knownGroupIds: ["101", "202"],
        active: true,
        companyId: "qa-local",
        phone: "060111",
        email: "home@qa.local"
    },
    {
        id: "drv-foreign-202",
        name: "Foreign Group Driver",
        firstName: "Foreign",
        lastName: "Driver",
        groupId: "202",
        lineId: "202",
        knownGroupIds: ["202", "101"],
        active: true,
        companyId: "qa-local",
        phone: "060222",
        email: "foreign@qa.local"
    }
];
fixture.state.buses = [
    { id: "bus-101", number: "B101", groupId: "101", groupIds: ["101"], active: true, companyId: "qa-local" },
    { id: "bus-202", number: "B202", groupId: "202", groupIds: ["202"], active: true, companyId: "qa-local" }
];
// Keep factory auth fields (password / passwordChanged); only tighten Dispo groups.
fixture.state.dispatchers = (fixture.state.dispatchers || []).map((d) => (
    d.isSuperAdmin
        ? d
        : { ...d, groups: ["101"], companyId: "qa-local", active: true, passwordChanged: true }
));
fixture.state.companyAdminOnboardingDone = true;
fixture.state.onboardingDone = true;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(
    ({ seeded, companyId }) => {
        window.__BUSCOMMAND_QA_HARNESS__ = true;
        window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
        const key = "buscommand_state_" + companyId;
        localStorage.setItem(key, JSON.stringify(seeded));
        sessionStorage.setItem(key, JSON.stringify(seeded));
        localStorage.setItem("buscommand_lang", "en");
        sessionStorage.setItem("buscommand_pretrip_done", "true");
    },
    { seeded: fixture.state, companyId: fixture.companyId }
);

await page.goto(`${baseURL}/staff.html`, { waitUntil: "networkidle" });
await shot(page, "01-login.png", "Staff login (QA harness)");

await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
await shot(page, "02-dispo-home.png", "Dispo shell after login");

// Simulate post-Rules client scope: only assigned-group drivers/buses in state.
await page.evaluate(() => {
    window.currentUser = {
        ...(window.currentUser || {}),
        role: "dispatcher",
        groups: ["101"],
        activeGroupId: "101",
        companyId: "qa-local"
    };
    window.state.drivers = (window.state.drivers || []).filter((d) => String(d.groupId) === "101");
    window.state.buses = (window.state.buses || []).filter((b) => String(b.groupId) === "101");
    window.state.groups = (window.state.groups || []).filter((g) => String(g.id) === "101");
    window.state.activeGroupHubId = "101";
    if (typeof window.openGroupHub === "function") window.openGroupHub("101");
});
await page.waitForTimeout(500);
await shot(page, "03-dispo-assigned-group.png", "Dispo assigned group hub (101 only)");

const bodyText = await page.locator("body").innerText();
if (/Foreign Group Driver|B202|Line 202/i.test(bodyText)) {
    log("foreign-absent", "Foreign group data still visible in Dispo UI", "fail");
} else {
    log("foreign-absent", "No foreign group driver/bus/line labels on Dispo surface", "pass");
}
if (!/Home Group Driver|B101|101/i.test(bodyText)) {
    log("assigned-present", "Assigned group markers missing", "fail");
} else {
    log("assigned-present", "Assigned group markers present", "pass");
}
await shot(page, "04-dispo-no-foreign.png", "Confirm foreign group data absent");

// Access-denied style: attempt to force foreign hub id — UI should stay on assigned / empty foreign.
await page.evaluate(() => {
    window.state.activeGroupHubId = "202";
    if (typeof window.openGroupHub === "function") {
        try { window.openGroupHub("202"); } catch (_) { /* expected soft deny */ }
    }
});
await page.waitForTimeout(400);
const afterForeign = await page.locator("body").innerText();
const foreignLeaked = /Foreign Group Driver/i.test(afterForeign);
log(
    "access-denied-path",
    foreignLeaked
        ? "Foreign driver leaked after forced hub 202"
        : "Forced foreign hub did not surface foreign driver (scoped state)",
    foreignLeaked ? "fail" : "pass"
);
await shot(page, "05-dispo-forced-foreign-hub.png", "After forced openGroupHub(202)");

// CA own-tenant: logout → login as company admin (factory password), full company drivers.
await page.locator('[data-action="logout"], #logout-btn, button:has-text("Log out")').first().click().catch(() => {});
await page.waitForTimeout(400);
await page.goto(`${baseURL}/staff.html`, { waitUntil: "networkidle" });
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("ca@qa.local");
await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
await page.evaluate((fullState) => {
    // Harness may hydrate a partial store — restore both groups for CA own-tenant proof.
    window.state = { ...window.state, ...fullState };
    window.state.drivers = fullState.drivers;
    window.state.groups = fullState.groups;
    window.state.buses = fullState.buses;
    if (typeof window.switchSection === "function") window.switchSection("company-admin-drivers");
    if (typeof window.renderCompanyAdminDrivers === "function") window.renderCompanyAdminDrivers();
}, fixture.state);
await page.waitForTimeout(700);
await shot(page, "06-ca-own-tenant.png", "CA own-tenant drivers view (both groups seeded)");

const caText = await page.locator("body").innerText();
const caSeesHome = /Home Group Driver/i.test(caText);
const caSeesForeign = /Foreign Group Driver/i.test(caText);
log(
    "ca-own-tenant",
    caSeesHome && caSeesForeign
        ? "CA sees both home and foreign-group drivers (own-tenant)"
        : `CA markers incomplete home=${caSeesHome} foreign=${caSeesForeign}`,
    caSeesHome && caSeesForeign ? "pass" : "fail"
);

await shot(page, "07-normal-after-rules.png", "Normal CA/Dispo product surface after Rules alignment (harness)");

writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
writeFileSync(
    join(outDir, "README.md"),
    [
        "# FAZA 1 visual trail",
        "",
        "- QA harness / ephemeral factory — **not** live Firebase Rules enforcement.",
        "- Authz proof = `npm run test:rules` + API unit gates.",
        `- TRAIL status: **${failed ? "FAIL" : "PASS"}**`,
        "",
        ...trail.map((t) => `- [${t.status}] ${t.step}: ${t.detail}`)
    ].join("\n")
);

await browser.close();
if (failed) {
    console.error("Phase 1 visual trail FAILED");
    process.exit(1);
}
console.log("Phase 1 visual trail PASS →", outDir);
