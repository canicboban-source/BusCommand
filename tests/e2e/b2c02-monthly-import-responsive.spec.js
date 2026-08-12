const { test, expect } = require("@playwright/test");
const { readFileSync } = require("fs");
const { join } = require("path");
const { seedDemoState, loginDispatcher } = require("./helpers.js");
const { createEphemeralQaState } = require("./qa-factory.js");

const FIXTURE = readFileSync(
  join(__dirname, "../fixtures/qa-monthly-plan-import-loose.txt"),
  "utf8"
);

const LONG_NAME = "Aleksandar Petrovic-Milutinovic";

function importState(lang = "sr") {
  const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: LONG_NAME,
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9",
    driverId: "11111111-1111-4111-8111-111111111111"
  });
  fixture.state.e2eFixture = true;
  fixture.state.activeGroupHubId = "101";
  fixture.state.activeLineId = "101";
  fixture.state.language = lang;
  fixture.state.drivers[0].active = true;
  fixture.state.drivers[0].name = LONG_NAME;
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

function boxesOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

async function openImportPreview(page, lang) {
  await page.evaluate((uiLang) => {
    window.state.activeGroupHubId = "101";
    window.state.activeLineId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage(uiLang);
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  }, lang);
  await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/, { timeout: 10000 });
  await page.locator('#dispatcher-monthly-plans-full [data-action="openMonthlyPlanImport"]').first().click();
  await expect(page.locator("#plan-import-dropzone")).toBeVisible();

  const body = FIXTURE.replace("Import CTA Driver", LONG_NAME);
  await page.locator("#bulk-plan-import-files").setInputFiles({
    name: "qa-monthly-plan-aleksandar-petrovic-milutinovic-2026-08.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8")
  });
  await expect(page.locator('[data-testid="plan-import-pending-row"]')).toBeVisible({ timeout: 15000 });
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const row = document.querySelector('[data-testid="plan-import-pending-row"]');
    const driverName = row?.querySelector('[data-testid="plan-import-driver-name"]');
    const month = row?.querySelector('[data-testid="plan-import-month-select"]');
    const removeBtn = row?.querySelector('[data-testid="plan-import-remove-btn"]');
    const previewBtn = document.querySelector('[data-testid="plan-import-server-preview-btn"]');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height
      };
    };
    const vp = { w: window.innerWidth, h: window.innerHeight };
    const inVp = (b) => !!b
      && b.left >= -1
      && b.top >= -1
      && b.right <= vp.w + 1
      && b.bottom <= vp.h + 1;
    return {
      vp,
      driverText: (driverName?.textContent || "").trim(),
      monthValue: month?.value || "",
      monthText: month?.selectedOptions?.[0]?.textContent?.trim() || "",
      monthAria: month?.getAttribute("aria-label") || "",
      nativeMonthCount: row?.querySelectorAll('input[type="month"]').length || 0,
      driverBox: box(driverName),
      monthBox: box(month),
      removeBox: box(removeBtn),
      previewBox: box(previewBtn),
      driverInViewport: inVp(box(driverName)),
      monthInViewport: inVp(box(month)),
      removeInViewport: inVp(box(removeBtn)),
      previewInViewport: inVp(box(previewBtn))
    };
  });
}

test.describe("B2C-02 monthly import responsive preview", () => {
  test("half-screen: full driver name, compact month, no overlap, actions usable", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 });
    await seedDemoState(page, importState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openImportPreview(page, "sr");

    const driverName = page.locator('[data-testid="plan-import-driver-name"]');
    await expect(driverName).toHaveText(LONG_NAME);
    await expect(page.locator('input[type="month"]')).toHaveCount(0);

    const month = page.locator('[data-testid="plan-import-month-select"]');
    await expect(month).toHaveValue("2026-08");
    await expect(month).toContainText("avg 2026");
    await expect(month).toHaveAttribute("aria-label", /Mesec|Month|Monat/i);

    const layout = await measureLayout(page);
    expect(layout.nativeMonthCount).toBe(0);
    expect(layout.driverText).toBe(LONG_NAME);
    expect(layout.monthValue).toBe("2026-08");
    expect(layout.monthText).toBe("avg 2026");
    expect(layout.driverInViewport).toBeTruthy();
    expect(layout.monthInViewport).toBeTruthy();
    expect(layout.removeInViewport).toBeTruthy();
    expect(layout.previewInViewport).toBeTruthy();
    expect(boxesOverlap(layout.driverBox, layout.monthBox)).toBeFalsy();
    expect(layout.monthBox.width).toBeLessThan(layout.driverBox.width + 40);

    await month.selectOption("2026-09");
    await expect(month).toHaveValue("2026-09");
    await expect(month).toContainText("sep 2026");

    await page.locator('[data-testid="plan-import-remove-btn"]').focus();
    await expect(page.locator('[data-testid="plan-import-remove-btn"]')).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-testid="plan-import-server-preview-btn"]')).toBeFocused();
  });

  test("desktop: driver name + localized month remain readable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedDemoState(page, importState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openImportPreview(page, "en");

    await expect(page.locator('[data-testid="plan-import-driver-name"]')).toHaveText(LONG_NAME);
    const month = page.locator('[data-testid="plan-import-month-select"]');
    await expect(month).toHaveValue("2026-08");
    await expect(month).toContainText("Aug 2026");

    const layout = await measureLayout(page);
    expect(layout.driverInViewport).toBeTruthy();
    expect(layout.monthInViewport).toBeTruthy();
    expect(boxesOverlap(layout.driverBox, layout.monthBox)).toBeFalsy();
  });

  test("de month label uses Mär/Okt/Dez uniquely", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await seedDemoState(page, importState("de"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openImportPreview(page, "de");

    const month = page.locator('[data-testid="plan-import-month-select"]');
    await expect(month).toHaveValue("2026-08");
    await expect(month).toContainText("Aug 2026");
    await month.selectOption("2026-03");
    await expect(month).toContainText("Mär 2026");
    await month.selectOption("2026-10");
    await expect(month).toContainText("Okt 2026");
    await month.selectOption("2026-12");
    await expect(month).toContainText("Dez 2026");
  });
});
