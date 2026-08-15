/**
 * Phase 0 closeout — visual trail for monthly import CTA (QA harness, no ?mode=demo).
 * Writes screenshots to reports/phase-0-visual/ and fails on raw i18n / false work-days copy.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-0-visual");
const PORT = process.env.PORT || "8766";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) {
    if (name.endsWith(".png") || name === "TRAIL.json") {
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
    const file = join(outDir, name);
    await page.screenshot({ path: file, fullPage: false });
    log(name, note, "pass");
    return file;
}

const RAW_KEY_RE = /\b[a-z]+(?:_[a-z0-9]+){2,}\b/g;
const KNOWN_FALSE_POSITIVES = new Set([
    "buscommand", "data-action", "data-i18n", "aria-label", "text-muted",
    "dispatcher", "company-admin", "superadmin"
]);

async function assertNoRawI18n(page, scope, label) {
    const text = await page.locator(scope).innerText().catch(() => "");
    const suspects = [...text.matchAll(RAW_KEY_RE)]
        .map((m) => m[0])
        .filter((k) => k.includes("_") && !KNOWN_FALSE_POSITIVES.has(k.toLowerCase()))
        .filter((k) => /^(monthly_|hub_|med_|ops_|ca_|sa_|btn_|error_)/.test(k));
    if (suspects.length) {
        log(`raw-i18n:${label}`, suspects.slice(0, 8).join(", "), "fail");
    } else {
        log(`raw-i18n:${label}`, "no raw monthly/hub/med keys", "pass");
    }
}

const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: "Import CTA Driver",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
});
fixture.state.drivers = [
    {
        id: "drv-import-cta",
        name: "Import CTA Driver",
        pin: "1234",
        bus: "91101",
        groupId: "101",
        lineId: "101",
        active: true,
        companyId: "qa-local"
    }
];
fixture.state.buses = [
    { id: "bus-91101", number: "91101", groupId: "101", lineId: "101", active: true, companyId: "qa-local" }
];
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
await shot(page, "01-login.png", "Staff login screen (QA harness)");

await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
await shot(page, "02-login-filled.png", "Dispo credentials filled");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
await shot(page, "03-dispo-home.png", "Dispatcher app shell after login");

await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
});
await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 10000 });
await shot(page, "04-monthly-full.png", "Monthly full page with import CTA");
await assertNoRawI18n(page, "#dispatcher-monthly-plans-full", "monthly-full");

const importBtn = page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first();
await importBtn.click();
await page.waitForTimeout(400);
await shot(page, "05-import-zone.png", "After openMonthlyPlanImport — import zone");
const zoneVisible = await page.locator("#dispo-monthly-plan-import").isVisible();
const noEmptyModal = (await page.locator("#new-plan-modal").count()) === 0;
log("assert-import", `zone=${zoneVisible} emptyModalAbsent=${noEmptyModal}`, zoneVisible && noEmptyModal ? "pass" : "fail");

await page.evaluate(() => {
    if (typeof window.openMonthlyDayEditForDriver === "function") {
        const month = new Date().toISOString().slice(0, 7);
        window.openMonthlyDayEditForDriver("Import CTA Driver", month, 3);
    }
});
await page.locator("#monthly-day-edit-modal").waitFor({ state: "visible", timeout: 10000 });
await shot(page, "06-day-edit-modal.png", "Monthly day edit modal open");
await assertNoRawI18n(page, "#monthly-day-edit-modal", "day-edit-modal");
const modalText = await page.locator("#monthly-day-edit-modal").innerText();
if (modalText.includes("monthly_edit_day")) {
    log("monthly_edit_day", "raw key still visible in modal", "fail");
} else {
    log("monthly_edit_day", "translated label visible", "pass");
}

await page.locator("#med-shift-type").selectOption("vacation");
await shot(page, "07-day-edit-vacation.png", "Vacation selected in day editor");
await page.locator('[data-action="saveMonthlyDayEdit"]').click();
await page.waitForTimeout(600);
await shot(page, "08-after-save.png", "After saveMonthlyDayEdit — summary + grid");

const summaryText = await page.locator("#monthly-plan-driver-summary").innerText().catch(() => "");
if (/work days|radnih dana|Arbeitstage/i.test(summaryText)) {
    log("summary-copy", `false work-days label: ${summaryText}`, "fail");
} else if (/assigned day|dodeljen dan|zugewiesener Tag/i.test(summaryText)) {
    log("summary-copy", summaryText.trim(), "pass");
} else {
    log("summary-copy", `unexpected summary: ${summaryText}`, "fail");
}
await assertNoRawI18n(page, "#dispatcher-monthly-plans-full", "after-save");

writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify(trail, null, 2));
await browser.close();
console.log(`Wrote trail → ${outDir} (failed=${failed})`);
process.exitCode = failed ? 1 : 0;
