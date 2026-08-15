/**
 * FAZA 1 Security Closeout — UX visual trail (QA harness, no ?mode=demo).
 * Screenshot = UX proof only. Authz proof = Rules query-contract + API HTTP tests.
 * Does NOT page.evaluate-filter window.state as authorization evidence.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-1-security-closeout-visual");
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

// Seed mirrors Rules-scoped Dispo load: only assigned group entities in client store.
const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: "Home Group Driver",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
});
fixture.state.groups = [
    { id: "101", lineId: "101", name: "Line 101", active: true, companyId: "qa-local" }
];
fixture.state.drivers = [
    {
        id: "drv-home-101",
        name: "Home Group Driver",
        firstName: "Home",
        lastName: "Driver",
        groupId: "101",
        lineId: "101",
        knownGroupIds: ["101"],
        active: true,
        companyId: "qa-local",
        phone: "060111",
        email: "home@qa.local"
    }
];
fixture.state.buses = [
    { id: "bus-101", number: "B101", groupId: "101", groupIds: ["101"], active: true, companyId: "qa-local" }
];
fixture.state.dispatchers = (fixture.state.dispatchers || []).map((d) => (
    d.isSuperAdmin
        ? d
        : {
            ...d,
            groups: ["101"],
            activeGroupId: "101",
            companyId: "qa-local",
            active: true,
            passwordChanged: true
        }
));
fixture.state.activeGroupHubId = "101";
fixture.state.companyAdminOnboardingDone = true;
fixture.state.onboardingDone = true;

// Full CA tenant snapshot (separate seed — not Dispo store).
const caTenantState = {
    ...fixture.state,
    groups: [
        { id: "101", lineId: "101", name: "Line 101", active: true, companyId: "qa-local" },
        { id: "202", lineId: "202", name: "Line 202", active: true, companyId: "qa-local" }
    ],
    drivers: [
        ...fixture.state.drivers,
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
            email: "foreign@qa.local",
            pin: "1234"
        }
    ],
    buses: [
        ...fixture.state.buses,
        { id: "bus-202", number: "B202", groupId: "202", groupIds: ["202"], active: true, companyId: "qa-local" }
    ]
};

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
await shot(page, "01-login.png", "Staff login");

await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(500);
await shot(page, "02-dispo-after-login.png", "Dispo immediately after login");

const afterLogin = await page.locator("body").innerText();
if (/Foreign Group Driver|B202|Line 202/i.test(afterLogin)) {
    log("no-foreign-flash", "Foreign markers visible right after login", "fail");
} else {
    log("no-foreign-flash", "No foreign driver/bus/line after login", "pass");
}
const headerSub = await page.locator("#header-user-sub").innerText().catch(() => "");
if (/202/.test(headerSub)) {
    log("header-assigned", `Header shows foreign group: ${headerSub}`, "fail");
} else {
    log("header-assigned", `Header active group OK: ${headerSub || "(empty)"}`, "pass");
}

// Open assigned hub via product action (not evaluate filter).
await page.evaluate(() => {
    if (typeof window.openGroupHub === "function") window.openGroupHub("101");
});
await page.waitForTimeout(400);
await shot(page, "03-dispo-assigned-hub.png", "Assigned group hub 101");
const hubText = await page.locator("body").innerText();
if (!/Home Group Driver|B101|101/i.test(hubText)) {
    log("assigned-visible", "Assigned markers missing on hub", "fail");
} else {
    log("assigned-visible", "Assigned group markers present", "pass");
}
if (/Foreign Group Driver|B202/i.test(hubText)) {
    log("hub-no-foreign", "Foreign data on assigned hub", "fail");
} else {
    log("hub-no-foreign", "Foreign data absent on assigned hub", "pass");
}

// Forced foreign open — client defense must reject; header must not stick on 202.
await page.evaluate(() => {
    window.state.activeGroupHubId = "202";
    window.currentUser.activeGroupId = "202";
    if (typeof window.openGroupHub === "function") window.openGroupHub("202");
});
await page.waitForTimeout(500);
await shot(page, "04-forced-foreign-rejected.png", "After forced openGroupHub(202)");
const afterForce = await page.locator("body").innerText();
const headerAfter = await page.locator("#header-user-sub").innerText().catch(() => "");
if (/Foreign Group Driver/i.test(afterForce)) {
    log("force-no-foreign-data", "Foreign driver visible after forced hub", "fail");
} else {
    log("force-no-foreign-data", "No foreign driver after forced hub", "pass");
}
if (/Active group:.*202|Line 202/i.test(headerAfter) && !/101/.test(headerAfter)) {
    log("force-header-clean", `Header stuck on foreign: ${headerAfter}`, "fail");
} else {
    log("force-header-clean", `Header not stuck on foreign-only 202: ${headerAfter}`, "pass");
}
const hubId = await page.evaluate(() => window.state?.activeGroupHubId);
if (hubId === "202") {
    log("force-hub-id", "activeGroupHubId still 202", "fail");
} else {
    log("force-hub-id", `activeGroupHubId sanitized to ${hubId}`, "pass");
}

// CA own-tenant — login as CA, then load full tenant roster into the CA surface
// (UX proof of own-tenant visibility; not Dispo authz evidence).
await page.locator('[data-action="logout"]').first().click().catch(async () => {
    await page.goto(`${baseURL}/staff.html`, { waitUntil: "networkidle" });
});
await page.waitForTimeout(400);
await page.goto(`${baseURL}/staff.html`, { waitUntil: "networkidle" });
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("ca@qa.local");
await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
await page.evaluate((full) => {
    const key = "buscommand_state_qa-local";
    window.state = { ...window.state, ...full, drivers: full.drivers, groups: full.groups, buses: full.buses };
    localStorage.setItem(key, JSON.stringify(window.state));
    sessionStorage.setItem(key, JSON.stringify(window.state));
    if (typeof window.switchSection === "function") window.switchSection("company-admin-drivers");
    if (typeof window.renderCompanyAdminDrivers === "function") window.renderCompanyAdminDrivers();
}, caTenantState);
await page.waitForTimeout(800);
await shot(page, "05-ca-both-drivers.png", "CA own-tenant sees both drivers");
const caText = await page.locator("body").innerText();
const caHome = /Home Group Driver/i.test(caText);
const caForeign = /Foreign Group Driver/i.test(caText);
log(
    "ca-own-tenant",
    caHome && caForeign ? "CA sees both drivers" : `CA incomplete home=${caHome} foreign=${caForeign}`,
    caHome && caForeign ? "pass" : "fail"
);

writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
writeFileSync(
    join(outDir, "README.md"),
    [
        "# FAZA 1 Security Closeout — visual trail",
        "",
        "- UX only. Security proof = `tests/rules/firestore.query-contract.test.js` + `tests/unit/phase1-message-sos-http.test.js`.",
        "- Dispo seed is Rules-shaped (assigned group only) — not mid-test evaluate filtering as authz.",
        `- TRAIL: **${failed ? "FAIL" : "PASS"}**`,
        "",
        ...trail.map((t) => `- [${t.status}] ${t.step}: ${t.detail}`)
    ].join("\n")
);

await browser.close();
if (failed) {
    console.error("Phase 1 security closeout visual FAILED");
    process.exit(1);
}
console.log("Phase 1 security closeout visual PASS →", outDir);
