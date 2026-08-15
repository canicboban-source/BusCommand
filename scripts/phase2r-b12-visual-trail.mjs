/**
 * FAZA 2R-B.1.2 visual trail —
 * A) Import Choose-files + FileChooser proof
 * B) Super Admin Manage account (no dead Open)
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-2r-b12-visual");
const PORT = process.env.PORT || "8785";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const FIXTURE = readFileSync(join(root, "tests/fixtures/qa-monthly-plan-import-loose.txt"), "utf8");

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) {
  if (name.endsWith(".png") || name === "TRAIL.json" || name === "README.md") {
    unlinkSync(join(outDir, name));
  }
}

const trail = [];
let failed = false;
function log(step, detail, status = "pass", screenshot = null) {
  trail.push({ step, detail, status, screenshot, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
  if (status === "fail") failed = true;
}

async function shot(page, name, note, assertionOk) {
  if (!assertionOk) {
    log(name, `assertion failed: ${note}`, "fail", null);
    await page.screenshot({ path: join(outDir, `FAIL-${name}`), fullPage: false }).catch(() => {});
    return false;
  }
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  log(name, note, "pass", name);
  return true;
}

async function seedPage(page, state, lang = "en") {
  await page.addInitScript(({ seeded, companyId, lang }) => {
    window.__BUSCOMMAND_QA_HARNESS__ = true;
    window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
    const key = "buscommand_state_" + companyId;
    localStorage.setItem(key, JSON.stringify(seeded));
    sessionStorage.setItem(key, JSON.stringify(seeded));
    localStorage.setItem("buscommand_lang", lang);
  }, { seeded: state, companyId: state.companyId || "qa-local", lang });
}

const dispoFixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: "Import CTA Driver",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9",
  driverId: "11111111-1111-4111-8111-111111111111"
});
dispoFixture.state.e2eFixture = true;
dispoFixture.state.activeGroupHubId = "101";
dispoFixture.state.activeLineId = "101";
dispoFixture.state.language = "sr";
dispoFixture.state.drivers[0].active = true;
dispoFixture.state.buses = [{
  id: "bus-91101", number: "91101", groupId: "101", lineId: "101",
  active: true, opsStatus: "ready", companyId: "qa-local"
}];
dispoFixture.state.shiftCatalogs = {
  "101": {
    groupId: "101",
    shifts: [{ code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }]
  }
};

const saFixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  saEmail: "sa@qa.local",
  caEmail: "ca@qa.local",
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9",
  driverName: "SA Visual Driver",
  driverPin: "1234"
});
saFixture.state.e2eFixture = true;
saFixture.state.language = "en";
for (const d of saFixture.state.dispatchers || []) {
  if (!d.isSuperAdmin) {
    d.features = { ...(d.features || {}), supportSession: true };
  }
}

const browser = await chromium.launch({ headless: true });

try {
  // --- A) Dispo import CTA ---
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await seedPage(page, dispoFixture.state, "sr");
  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.fill("#login-dispatcher-email", "dispo@qa.local");
  await page.fill("#login-dispatcher-password", "Qa-test-ok-9");
  await page.click("#dispatcher-login-btn");
  await page.waitForFunction(() => window.state?.drivers?.length > 0, null, { timeout: 20000 });
  await page.evaluate(() => {
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    window.state.activeGroupHubId = "101";
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.waitForTimeout(600);

  const chooseVisible = await page.locator("#plan-import-choose-files").isVisible();
  const chooseText = await page.locator("#plan-import-choose-files").innerText().catch(() => "");
  await shot(
    page,
    "01-choose-files-button.png",
    `visible Choose-files button text=${chooseText.slice(0, 60)}`,
    chooseVisible && /Izaberi fajlove|Choose files|Dateien auswählen/i.test(chooseText)
  );

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 8000 }),
    page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click()
  ]);
  log("filechooser-main-cta", "Playwright filechooser event fired from main CTA click", "pass");
  await chooser.setFiles({
    name: "qa-monthly-plan-import-loose.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(FIXTURE, "utf8")
  });
  await page.waitForSelector("#plan-import-preview", { state: "visible", timeout: 15000 });
  const previewOk = await page.locator('[data-testid="plan-import-pending-row"]').isVisible();
  await shot(
    page,
    "02-preview-after-chooser.png",
    "Real import preview after FileChooser setFiles (not direct setInputFiles-as-CTA-proof)",
    previewOk
  );
  await page.close();

  // --- B) Super Admin Manage account ---
  const saPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await seedPage(saPage, saFixture.state, "en");
  await saPage.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await saPage.locator("#tab-dispatcher-btn").click().catch(() => {});
  await saPage.fill("#login-dispatcher-email", "sa@qa.local");
  await saPage.fill("#login-dispatcher-password", "Qa-test-ok-9");
  await saPage.click("#dispatcher-login-btn");
  await saPage.waitForSelector("#superadmin-dashboard", { state: "visible", timeout: 20000 });
  await saPage.evaluate(() => {
    if (typeof window.changeLanguage === "function") window.changeLanguage("en");
  });
  await saPage.waitForTimeout(400);

  const manageBtn = saPage.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first();
  const manageText = (await manageBtn.innerText().catch(() => "")).trim();
  await shot(
    saPage,
    "03-sa-manage-account-table.png",
    `Company table Manage account CTA text=${manageText.slice(0, 80)}`,
    await manageBtn.isVisible() && /Manage account|Konto verwalten|Upravljaj nalogom/i.test(manageText)
  );

  await manageBtn.click();
  await saPage.waitForSelector("#sa-company-detail-modal", { state: "visible", timeout: 10000 });
  const deadOpen = await saPage.locator("#sa-detail-open-app-btn").count();
  const footerText = (await saPage.locator("#sa-company-detail-modal .sa-detail-footer").innerText().catch(() => ""));
  const settingsVisible = await saPage.locator("#sa-detail-settings").isVisible();
  await shot(
    saPage,
    "04-sa-account-modal.png",
    `Account modal open; settings=${settingsVisible}; deadOpen=${deadOpen}; footer=${footerText.replace(/\s+/g, " ").slice(0, 120)}`,
    settingsVisible && deadOpen === 0 && !/(^|\s)Open(\s|$)/i.test(footerText)
  );

  const supportBtn = saPage.locator("#sa-detail-support-btn");
  const supportVisible = await supportBtn.isVisible().catch(() => false);
  if (supportVisible) {
    await supportBtn.click();
    const supportModal = await saPage.locator("#sa-support-modal").isVisible().catch(() => false);
    await shot(
      saPage,
      "05-sa-start-audited-support.png",
      "Start audited support opens real support modal",
      supportModal
    );
  } else {
    log("05-sa-start-audited-support.png", "Support CTA hidden (supportSession not enabled) — optional per contract", "pass", null);
  }
  await saPage.close();

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    failed,
    note: "OS/native file chooser UI cannot be proven by screenshot; Playwright filechooser event is the authority. SA Open CTA removed.",
    trail
  }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 2R-B.1.2 visual trail",
    "",
    "1. Visible accessible **Izaberi fajlove** / `select_file` button in import panel.",
    "2. Real preview after main CTA → FileChooser → fixture pick.",
    "3. Super Admin company table with **Manage account**.",
    "4. Account-management modal open; footer without dead **Open**.",
    "5. Optional **Start audited support** when enabled.",
    "",
    "**Note:** The OS native chooser dialog cannot be captured in a screenshot in this harness;",
    "Playwright `filechooser` event proves the human click opened it.",
    "",
    ...trail.map((t) => `- **${t.step}** [${t.status}] ${t.detail}`)
  ].join("\n"));

  if (failed) {
    console.error("VISUAL TRAIL FAILED");
    process.exit(1);
  }
  console.log("VISUAL TRAIL OK");
} catch (err) {
  console.error(err);
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed: true, trail, error: String(err) }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
