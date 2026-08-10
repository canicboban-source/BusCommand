const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { seedDemoState, loginDispatcher } = require("./helpers.js");

const CHUNK_RE = /\/assets\/plan-import-[^/?#]+\.js(?:\?|$)/i;
const FIXTURE = fs.readFileSync(
  path.join(__dirname, "../fixtures/qa-monthly-plan-import-loose.txt"),
  "utf8"
);

function importState(lang = "en") {
  return {
    language: lang,
    companyId: "qa-local",
    e2eFixture: true,
    groups: [{ id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "qa-local" }],
    dispatchers: [
      {
        id: "dispo-qa-1",
        name: "QA Dispatcher",
        email: "dispo@qa.local",
        password: "Qa-test-ok-9",
        passwordChanged: true,
        groups: ["101"],
        companyId: "qa-local",
        active: true
      }
    ],
    companyAdmins: [{
      id: "ca-qa-1",
      name: "QA CA",
      email: "ca@qa.local",
      password: "Qa-test-ok-9",
      companyId: "qa-local",
      active: true
    }],
    drivers: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "Import CTA Driver",
      pin: "1234",
      bus: "91101",
      groupId: "101",
      lineId: "101",
      active: true,
      companyId: "qa-local"
    }],
    buses: [{
      id: "bus-91101",
      number: "91101",
      groupId: "101",
      lineId: "101",
      active: true,
      opsStatus: "ready",
      companyId: "qa-local"
    }],
    schedules: [],
    shifts: [],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    shiftCatalogs: {
      "101": {
        groupId: "101",
        shifts: [
          { code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }
        ]
      }
    },
    onboardingDone: true,
    companyAdminOnboardingDone: true
  };
}

async function openMonthlyImport(page) {
  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    window.state.activeLineId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (typeof window.openMonthlyPlansFull === "function") {
      window.openMonthlyPlansFull();
    }
  });
  await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/, { timeout: 10000 });
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await expect(page.locator("#plan-import-dropzone")).toBeVisible();
}

test.describe("2R-B.1 plan-import lazy chunk recovery", () => {
  test("chunk failure then retry loads module; request count proves new import attempt", async ({ page }) => {
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));

    let chunkRequests = 0;
    let allowChunk = false;
    await page.route(CHUNK_RE, async (route) => {
      chunkRequests += 1;
      if (!allowChunk) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await seedDemoState(page, importState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);

    const input = page.locator("#bulk-plan-import-files");
    await input.setInputFiles({
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });

    const toast = page.locator(".toast-error .toast-msg").first();
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/could not be loaded|nije učitan|nicht geladen/i);
    expect(await input.inputValue()).toBe("");
    const failedRequests = chunkRequests;
    expect(failedRequests).toBeGreaterThanOrEqual(1);

    allowChunk = true;
    await input.setInputFiles({
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });

    await expect(page.locator("#plan-import-preview")).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="plan-import-pending-row"]')).toBeVisible();
    await expect(page.locator("#plan-import-preview")).toContainText("Import CTA Driver");
    expect(chunkRequests).toBeGreaterThan(failedRequests);
    expect(unhandled).toEqual([]);
  });

  test("explicit chunk failure shows localized toast without unhandled rejection", async ({ page }) => {
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));

    await page.route(CHUNK_RE, async (route) => {
      await route.abort("failed");
    });

    await seedDemoState(page, importState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);

    await page.evaluate(() => {
      window.state.activeGroupHubId = "101";
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });
    await openMonthlyImport(page);

    await page.setInputFiles("#bulk-plan-import-files", {
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });

    const toast = page.locator(".toast-error .toast-msg").first();
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/Modul za mesečni uvoz nije učitan|choose the file again|Datei erneut/i);
    await expect(toast).not.toContainText(/rollback|commit|ostaju na mestu|stay in place/i);
    await expect(page.locator("#plan-import-dropzone")).toBeVisible();
    expect(await page.locator("#bulk-plan-import-files").inputValue()).toBe("");
    expect(unhandled).toEqual([]);
  });
});
