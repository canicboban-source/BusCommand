const { test, expect } = require("@playwright/test");
const { readFileSync } = require("fs");
const { join } = require("path");
const { seedDemoState, loginDispatcher, loginCompanyAdmin } = require("./helpers.js");
const { createEphemeralQaState } = require("./qa-factory.js");

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/qa-monthly-plan-import-loose.txt"),
  "utf8"
);

function importState(lang = "en") {
  const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: "Import CTA Driver",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9",
    driverId: "11111111-1111-4111-8111-111111111111"
  });
  fixture.state.e2eFixture = true;
  fixture.state.activeGroupHubId = "101";
  fixture.state.activeLineId = "101";
  fixture.state.language = lang;
  fixture.state.drivers[0].active = true;
  fixture.state.drivers[0].bus = "91101";
  fixture.state.buses = [{
    id: "bus-91101",
    number: "91101",
    groupId: "101",
    lineId: "101",
    active: true,
    opsStatus: "ready",
    companyId: "qa-local"
  }];
  fixture.state.shiftCatalogs = {
    "101": {
      groupId: "101",
      shifts: [{ code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }]
    }
  };
  return fixture.state;
}

async function openMonthlyFull(page) {
  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/, { timeout: 10000 });
}

async function expectPreview(page) {
  await expect(page.locator("#plan-import-preview")).toBeVisible({ timeout: 15000 });
  const row = page.locator('[data-testid="plan-import-pending-row"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-driver-id", "11111111-1111-4111-8111-111111111111");
  await expect(page.locator('[data-testid="plan-import-file-name"]')).toHaveText("qa-monthly-plan-import-loose.txt");
}

test.describe("2R-B.1.2 import CTA human filechooser", () => {
  test("main CTA click opens exactly one FileChooser and real preview after pick", async ({ page }) => {
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Unhandled|unhandledrejection/i.test(msg.text())) {
        unhandled.push(msg.text());
      }
    });

    await seedDemoState(page, importState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyFull(page);

    const importBtn = page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first();
    await expect(importBtn).toBeVisible();

    let chooserCount = 0;
    page.on("filechooser", () => { chooserCount += 1; });

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 8000 }),
      importBtn.click()
    ]);
    expect(chooserCount).toBe(1);
    // Proof is FileChooser from real click — not a direct setInputFiles on the hidden input.
    await chooser.setFiles({
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });
    await expectPreview(page);
    expect(chooserCount).toBe(1);
    expect(unhandled).toEqual([]);
  });

  test("visible Choose-files button opens FileChooser and preview", async ({ page }) => {
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));

    await seedDemoState(page, importState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });
    await openMonthlyFull(page);

    const chooseBtn = page.locator("#plan-import-choose-files");
    await expect(chooseBtn).toBeVisible();
    await expect(chooseBtn).toContainText(/Izaberi fajlove|Choose files|Dateien auswählen/i);

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 8000 }),
      chooseBtn.click()
    ]);
    await chooser.setFiles({
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });
    await expectPreview(page);
    expect(unhandled).toEqual([]);
  });

  test("no active group: localized toast and no filechooser", async ({ page }) => {
    await seedDemoState(page, importState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
      window.state.activeGroupHubId = null;
      window.state.activeGroupFilter = null;
      if (window.currentUser) window.currentUser.activeGroupId = null;
    });

    let chooserOpened = false;
    page.on("filechooser", () => { chooserOpened = true; });

    // CTA may live on hub / empty state — call registered action after clearing group.
    await page.evaluate(() => {
      if (typeof window.openMonthlyPlanImport === "function") window.openMonthlyPlanImport();
    });
    await expect(page.locator("#toast-container .toast")).toContainText(/grupu|group|Gruppe/i, { timeout: 5000 });
    await page.waitForTimeout(400);
    expect(chooserOpened).toBe(false);
  });

  test("CA read-only ops view: no mutation and no filechooser", async ({ page }) => {
    await seedDemoState(page, importState("en"));
    await page.goto("/staff.html");
    await loginCompanyAdmin(page);
    await page.evaluate(() => {
      window.state.activeGroupHubId = "101";
      if (window.currentUser) {
        window.currentUser.activeGroupId = "101";
        window.currentUser.role = "company_admin";
      }
      if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
    });
    await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/, { timeout: 10000 });

    let chooserOpened = false;
    page.on("filechooser", () => { chooserOpened = true; });

    const importBtn = page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first();
    if (await importBtn.isVisible().catch(() => false)) {
      await importBtn.click();
    } else {
      await page.evaluate(() => window.openMonthlyPlanImport && window.openMonthlyPlanImport());
    }
    await expect(page.locator("#toast-container .toast")).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(300);
    expect(chooserOpened).toBe(false);
    await expect(page.locator("#plan-import-preview")).toBeHidden();
  });

  test("cancel FileChooser leaves no false success or error toast", async ({ page }) => {
    await seedDemoState(page, importState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyFull(page);

    await page.evaluate(() => {
      const el = document.getElementById("toast-container");
      if (el) el.replaceChildren();
    });

    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 8000 }),
      page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click()
    ]);
    // Cancel = do not set files (Playwright already intercepted the native dialog).
    expect(chooser).toBeTruthy();
    await page.waitForTimeout(500);
    await expect(page.locator("#plan-import-preview")).toBeHidden();
    await expect(page.locator("#toast-container .toast")).toHaveCount(0);
  });

  test("keyboard Enter on Choose-files opens FileChooser", async ({ page }) => {
    await seedDemoState(page, importState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyFull(page);

    const chooseBtn = page.locator("#plan-import-choose-files");
    await expect(chooseBtn).toBeVisible();
    // Element-targeted key press keeps activation on the button (native Enter → click).
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 8000 }),
      chooseBtn.press("Enter")
    ]);
    await chooser.setFiles({
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });
    await expectPreview(page);
  });
});
