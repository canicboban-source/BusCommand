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

test.describe("2R-B.1.1 file-event + recovery-origin", () => {
  test("file input: load failure clears input; same fixture re-parse shows real preview", async ({ page }) => {
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));

    let allowChunk = false;
    let chunkRequests = 0;
    await page.route(CHUNK_RE, async (route) => {
      chunkRequests += 1;
      if (!allowChunk) {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await seedDemoState(page, importState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });
    await openMonthlyImport(page);

    const input = page.locator("#bulk-plan-import-files");
    await input.setInputFiles({
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });

    const toast = page.locator(".toast-error .toast-msg").first();
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/ponovo izaberite fajl|choose the file again|Datei erneut auswählen/i);
    await expect(toast).not.toContainText(/ostaju na mestu|stay in place|bleiben erhalten/i);

    const valueAfterFail = await input.inputValue();
    expect(valueAfterFail).toBe("");

    const failedRequests = chunkRequests;
    expect(failedRequests).toBeGreaterThanOrEqual(1);

    allowChunk = true;
    await input.setInputFiles({
      name: "qa-monthly-plan-import-loose.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(FIXTURE, "utf8")
    });

    await expect(page.locator("#plan-import-preview")).toBeVisible({ timeout: 15000 });
    const row = page.locator('[data-testid="plan-import-pending-row"]');
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-driver-id", "11111111-1111-4111-8111-111111111111");
    await expect(page.locator('[data-testid="plan-import-file-name"]')).toHaveText("qa-monthly-plan-import-loose.txt");
    await expect(row.locator('input[type="month"]')).toHaveValue("2026-08");
    await expect(row.locator("td").nth(3)).toHaveText("1");
    expect(chunkRequests).toBeGreaterThan(failedRequests);
    expect(unhandled).toEqual([]);
  });

  test("cold drop: delayed chunk; File snapshot parses after release without test hook", async ({ page }) => {
    let releaseChunk;
    const gate = new Promise((resolve) => { releaseChunk = resolve; });
    let chunkRequests = 0;
    await page.route(CHUNK_RE, async (route) => {
      chunkRequests += 1;
      await gate;
      await route.continue();
    });

    await seedDemoState(page, importState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyImport(page);

    // Prefetch may be waiting on gate; drop while chunk still pending.
    await page.evaluate((body) => {
      const dt = new DataTransfer();
      dt.items.add(new File([body], "qa-monthly-plan-import-loose.txt", { type: "text/plain" }));
      const zone = document.getElementById("plan-import-dropzone");
      const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });
      zone.dispatchEvent(drop);
    }, FIXTURE);

    await page.waitForTimeout(400);
    await expect(page.locator("#plan-import-preview")).toBeHidden();
    expect(chunkRequests).toBeGreaterThanOrEqual(1);

    releaseChunk();

    await expect(page.locator("#plan-import-preview")).toBeVisible({ timeout: 20000 });
    const rows = page.locator('[data-testid="plan-import-pending-row"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-driver-id", "11111111-1111-4111-8111-111111111111");
    await expect(rows.first().locator('input[type="month"]')).toHaveValue("2026-08");
    await expect(rows.first().locator("td").nth(3)).toHaveText("1");
  });
});
