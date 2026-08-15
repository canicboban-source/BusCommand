/**
 * FAZA 2R-B.1.2 / Gate 3.0 — Super Admin Manage account verifier (no dead Open).
 * Proves: Manage account opens account modal; no #sa-detail-open-app-btn;
 * Start audited support opens support modal when available; Close closes modal.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const dir = path.resolve("reports/pilot-browser-shots");
fs.mkdirSync(dir, { recursive: true });
const trail = [];
const PORT = process.env.PORT || "8766";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  saEmail: "sa@qa.local",
  caEmail: "ca@qa.local",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9",
  driverName: "SA Verify Driver",
  driverPin: "1234"
});
fixture.state.e2eFixture = true;
fixture.state.language = "en";
for (const d of fixture.state.dispatchers || []) {
  if (!d.isSuperAdmin) d.features = { ...(d.features || {}), supportSession: true };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

async function shot(name, note) {
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false });
  trail.push({ step: name, note, url: page.url() });
  console.log("SHOT", name, note);
}

let failed = false;
function fail(msg) {
  failed = true;
  console.error("FAIL", msg);
  trail.push({ step: "fail", note: msg });
}

await page.addInitScript(({ seeded, companyId }) => {
  window.__BUSCOMMAND_QA_HARNESS__ = true;
  window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
  const key = "buscommand_state_" + companyId;
  localStorage.setItem(key, JSON.stringify(seeded));
  sessionStorage.setItem(key, JSON.stringify(seeded));
  localStorage.setItem("buscommand_lang", "en");
}, { seeded: fixture.state, companyId: "qa-local" });

await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.fill("#login-dispatcher-email", "sa@qa.local");
await page.fill("#login-dispatcher-password", "Qa-test-ok-9");
await page.click("#dispatcher-login-btn");
await page.waitForSelector("#superadmin-dashboard", { state: "visible", timeout: 20000 });
await shot("09-sa-before-manage", "SA logged in");

const deadOpenCount = await page.locator("#sa-detail-open-app-btn").count();
if (deadOpenCount !== 0) fail(`dead Open present count=${deadOpenCount}`);

const manageBtn = page.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first();
const manageText = (await manageBtn.innerText()).trim();
if (!/Manage account|Konto verwalten|Upravljaj nalogom/i.test(manageText)) {
  fail(`Manage account label missing: ${manageText}`);
}
await manageBtn.click();
const modal = page.locator("#sa-company-detail-modal");
await modal.waitFor({ state: "visible", timeout: 10000 });
const settingsOk = await page.locator("#sa-detail-settings").isVisible().catch(() => false);
const footerText = (await page.locator("#sa-company-detail-modal .sa-detail-footer").innerText().catch(() => ""));
await shot("10-sa-manage-account-modal", `settings=${settingsOk}; footer=${footerText.replace(/\s+/g, " ").slice(0, 100)}`);
if (!settingsOk) fail("account settings section not visible");
if (/(^|\s)Open(\s|$)/i.test(footerText)) fail("footer still contains Open");

const supportBtn = page.locator("#sa-detail-support-btn");
const supportVisible = await supportBtn.isVisible().catch(() => false);
if (supportVisible) {
  await supportBtn.click();
  const supportModal = await page.locator("#sa-support-modal").isVisible().catch(() => false);
  await shot("11-sa-start-audited-support", `supportModal=${supportModal}`);
  if (!supportModal) fail("Start audited support did not open support modal");
  await page.locator('[data-action="superadminCancelSupportModal"]').click().catch(() => {});
  await page.waitForTimeout(200);
} else {
  trail.push({ step: "11-sa-start-audited-support", note: "support CTA hidden — optional" });
}

await page.locator('#sa-company-detail-modal [data-action="superadminCloseCompanyDetail"]').last().click();
await page.waitForTimeout(300);
const closed = !(await modal.isVisible().catch(() => true));
await shot("12-sa-close-detail", `closed=${closed}`);
if (!closed) fail("Close did not hide account modal");

fs.writeFileSync(path.join(dir, "manage-account-trail.json"), JSON.stringify({ trail, failed, manageText }, null, 2));
console.log(JSON.stringify({ failed, manageText, deadOpenCount, supportVisible, closed }, null, 2));
await browser.close();
process.exit(failed ? 1 : 0);
