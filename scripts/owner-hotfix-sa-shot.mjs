import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createEphemeralQaState, installQaHarness } = require("../tests/e2e/qa-factory.js");

const OUT = path.join("reports", "screenshots");
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8766";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const fixture = createEphemeralQaState({
    companyId: "qa-hotfix",
    groupId: "g-hotfix",
    saEmail: "sa@qa.local",
    caEmail: "ca@qa.local",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
  });
  fixture.state.dispatchers = fixture.state.dispatchers.map((d) => (
    d.isSuperAdmin
      ? d
      : {
          ...d,
          maxDrivers: 50,
          maxDispatchers: 5,
          licenseType: "pro",
          plan: "pro",
          trialDaysLeft: 12,
          paymentStatus: "Trial"
        }
  ));

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await installQaHarness(page, {
    companyId: "qa-hotfix",
    state: { ...fixture.state, e2eFixture: true, companyId: "qa-hotfix" },
    saEmail: "sa@qa.local",
    caEmail: "ca@qa.local",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9"
  });

  await page.goto(`${BASE}/staff.html`);
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill("sa@qa.local");
  await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
  await page.locator('[data-action="superadminOpenCompanyDetail"]').first().click();
  await page.locator("#sa-company-detail-modal").waitFor({ state: "visible" });
  await page.locator("#sa-edit-plan").waitFor({ state: "visible", timeout: 8000 });
  await page.locator("#sa-edit-plan").scrollIntoViewIfNeeded();
  await page.locator("#sa-edit-plan").selectOption("fleet_master");
  await page.waitForTimeout(250);
  const maxD = await page.locator("#sa-edit-max-drivers").inputValue();
  const maxDisp = await page.locator("#sa-edit-max-dispatchers").inputValue();
  if (maxD !== "200" || maxDisp !== "15") {
    throw new Error(`limits ${maxD}/${maxDisp}`);
  }
  await page.locator("#sa-detail-settings").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, "02-sa-license-limits-fleet-master.png") });
  await page.locator("#sa-detail-settings").screenshot({
    path: path.join(OUT, "02b-sa-settings-limits.png")
  });
  console.log("OK limits", maxD, maxDisp);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
