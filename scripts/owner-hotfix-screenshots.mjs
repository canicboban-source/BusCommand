/**
 * Owner hotfix visual proof — Playwright screenshots into reports/screenshots/.
 * Uses ephemeral QA harness (never demo tenants / ?mode=demo).
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createEphemeralQaState, installQaHarness } = require("../tests/e2e/qa-factory.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "reports", "screenshots");
const PORT = process.env.PORT || "8766";
const BASE = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

async function ensureOut() {
  fs.mkdirSync(OUT, { recursive: true });
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
  return file;
}

async function loginAs(page, email, password) {
  await page.goto(`${BASE}/staff.html`);
  const tab = page.locator("#tab-dispatcher-btn");
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await page.locator("#login-dispatcher-email").fill(email);
  await page.locator("#login-dispatcher-password").fill(password);
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
}

async function main() {
  await ensureOut();
  const fixture = createEphemeralQaState({
    companyId: "qa-hotfix",
    groupId: "g-hotfix",
    saEmail: "sa@qa.local",
    caEmail: "ca@qa.local",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
  });
  // Ensure Dispo has an active group for plan modal; CA has groups for driver add.
  fixture.state.dispatchers = fixture.state.dispatchers.map((d) => {
    if (d.isSuperAdmin) return d;
    return {
      ...d,
      maxDrivers: 50,
      maxDispatchers: 5,
      licenseType: "pro",
      plan: "pro",
      trialDaysLeft: 12,
      paymentStatus: "Trial"
    };
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await installQaHarness(page, {
    companyId: fixture.companyId || "qa-hotfix",
    state: { ...fixture.state, e2eFixture: true, companyId: "qa-hotfix" },
    saEmail: "sa@qa.local",
    caEmail: "ca@qa.local",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
  });

  // ── a) CA + Dodaj vozača modal ─────────────────────────────
  await loginAs(page, "ca@qa.local", "Qa-test-ok-9");
  await page.locator('.nav-item[data-action-args*=\"company-admin-drivers\"]').first().click();
  await page.locator("#company-admin-drivers").waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(400);
  await page.locator("#ca-driver-add-open").click();
  await page.locator("#ca-driver-add-modal").waitFor({ state: "visible" });
  await page.locator("#ca-driver-add-eid").fill("EID-HOTFIX-001");
  await page.locator("#ca-driver-add-first-name").fill("Marko");
  await page.locator("#ca-driver-add-last-name").fill("Petrović");
  await page.locator("#ca-driver-add-email").fill("marko.petrovic@qa.local");
  await page.locator("#ca-driver-add-phone").fill("+436991112223");
  await page.locator("#ca-driver-add-pin").fill("12345");
  const groupSelect = page.locator("#ca-driver-add-group");
  const opt = await groupSelect.locator("option").nth(1).getAttribute("value");
  if (opt) await groupSelect.selectOption(opt);
  await shot(page, "01-ca-add-driver-modal.png");

  // ── b) SA license modal + auto limits ──────────────────────
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await context.clearCookies();
  const page2 = await context.newPage();
  await installQaHarness(page2, {
    companyId: "qa-hotfix",
    state: { ...fixture.state, e2eFixture: true, companyId: "qa-hotfix" },
    saEmail: "sa@qa.local",
    caEmail: "ca@qa.local",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
  });
  await loginAs(page2, "sa@qa.local", "Qa-test-ok-9");
  await page2.waitForTimeout(500);
  const detailBtn = page2.locator('[data-action="superadminOpenCompanyDetail"]').first();
  await detailBtn.waitFor({ state: "visible", timeout: 10000 });
  await detailBtn.click();
  await page2.locator("#sa-company-detail-modal").waitFor({ state: "visible" });
  await page2.waitForTimeout(300);
  await page2.locator("#sa-edit-plan").selectOption("fleet_master");
  await page2.waitForTimeout(200);
  const maxD = await page2.locator("#sa-edit-max-drivers").inputValue();
  const maxDisp = await page2.locator("#sa-edit-max-dispatchers").inputValue();
  if (maxD !== "200" || maxDisp !== "15") {
    throw new Error(`Plan change did not refresh limits: drivers=${maxD} dispatchers=${maxDisp}`);
  }
  await shot(page2, "02-sa-license-limits-fleet-master.png");

  // ── c) Dispo new plan modal / monthly plan screen ──────────
  await page2.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  const page3 = await context.newPage();
  await installQaHarness(page3, {
    companyId: "qa-hotfix",
    state: { ...fixture.state, e2eFixture: true, companyId: "qa-hotfix" },
    saEmail: "sa@qa.local",
    caEmail: "ca@qa.local",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
  });
  await loginAs(page3, "dispo@qa.local", "Qa-test-ok-9");
  await page3.waitForTimeout(400);
  // Open group hub via action delegate (handlers are not on window)
  await page3.evaluate((groupId) => {
    const btn = document.createElement("button");
    btn.setAttribute("data-action", "openGroupHub");
    btn.setAttribute("data-action-args", JSON.stringify([groupId]));
    document.body.appendChild(btn);
    btn.click();
    btn.remove();
  }, "g-hotfix");
  await page3.locator("#dispatcher-group-hub").waitFor({ state: "visible", timeout: 10000 });
  await page3.waitForTimeout(500);
  const newPlanBtn = page3.locator('[data-action="openNewPlanModal"]').first();
  if (await newPlanBtn.count()) {
    await newPlanBtn.click();
  } else {
    await page3.evaluate(() => {
      const btn = document.createElement("button");
      btn.setAttribute("data-action", "openNewPlanModal");
      btn.setAttribute("data-action-args", JSON.stringify(["monthly"]));
      document.body.appendChild(btn);
      btn.click();
      btn.remove();
    });
  }
  await page3.locator("#new-plan-modal").waitFor({ state: "visible", timeout: 8000 });
  await page3.locator("#new-plan-kind").selectOption("monthly");
  await shot(page3, "03-new-plan-modal.png");
  await page3.locator('[data-action="confirmNewPlan"]').click();
  await page3.waitForTimeout(600);
  await shot(page3, "04-monthly-plan-after-create.png");

  await browser.close();
  console.log("OK — screenshots written to", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
