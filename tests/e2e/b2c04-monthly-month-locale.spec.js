const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher } = require("./helpers.js");
const { createEphemeralQaState } = require("./qa-factory.js");

const DRIVER = "Aleksandar Petrovic-Milutinovic";

function monthlyState(lang = "sr") {
  const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: DRIVER,
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9",
    driverId: "11111111-1111-4111-8111-111111111111"
  });
  fixture.state.e2eFixture = true;
  fixture.state.activeGroupHubId = "101";
  fixture.state.activeLineId = "101";
  fixture.state.language = lang;
  fixture.state.drivers[0].active = true;
  fixture.state.drivers[0].name = DRIVER;
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

async function openMonthlyFull(page, lang) {
  await page.evaluate((uiLang) => {
    window.state.activeGroupHubId = "101";
    window.state.activeLineId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage(uiLang);
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  }, lang);
  await expect(page.locator("#dispatcher-monthly-plans-full")).not.toHaveClass(/hidden/, { timeout: 10000 });
  await expect(page.locator("#monthly-month-select")).toBeVisible();
}

function boxesOverlap(a, b) {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
}

test.describe("B2C-04 monthly-plan month locale", () => {
  test("sr half-screen: avg 2026, no Cyrillic/August, avg→sep keeps YYYY-MM", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 });
    await seedDemoState(page, monthlyState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyFull(page, "sr");

    const month = page.locator("#monthly-month-select");
    await expect(page.locator('input[type="month"]')).toHaveCount(0);

    await month.selectOption("2026-08");
    await expect(month).toHaveValue("2026-08");
    await expect(month.locator("option:checked")).toHaveText("avg 2026");
    await expect(month).not.toContainText(/август|August/i);

    const aria = await month.getAttribute("aria-label");
    expect(aria).toMatch(/Mesec|Month|Monat/i);

    await month.selectOption("2026-09");
    await expect(month).toHaveValue("2026-09");
    await expect(month.locator("option:checked")).toHaveText("sep 2026");

    await page.locator("#monthly-driver-select").scrollIntoViewIfNeeded();
    const layout = await page.evaluate(() => {
      const driver = document.getElementById("monthly-driver-select");
      const monthEl = document.getElementById("monthly-month-select");
      const box = (el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      const vp = { w: window.innerWidth, h: window.innerHeight };
      const inVp = (b) => b.left >= -1 && b.top >= -1 && b.right <= vp.w + 1 && b.bottom <= vp.h + 1;
      return {
        driverBox: box(driver),
        monthBox: box(monthEl),
        driverInViewport: inVp(box(driver)),
        monthInViewport: inVp(box(monthEl))
      };
    });
    expect(layout.driverInViewport).toBeTruthy();
    expect(layout.monthInViewport).toBeTruthy();
    expect(boxesOverlap(layout.driverBox, layout.monthBox)).toBeFalsy();

    await month.focus();
    await expect(month).toBeFocused();
    await page.keyboard.press("Tab");
  });

  test("en/de labels and language change rerenders abbr", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await seedDemoState(page, monthlyState("en"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await openMonthlyFull(page, "en");

    const month = page.locator("#monthly-month-select");
    await month.selectOption("2026-08");
    await expect(month.locator("option:checked")).toHaveText("Aug 2026");

    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("de");
    });
    await expect(page.locator("#monthly-month-select option:checked")).toHaveText("Aug 2026");
    // Window is current±offsets; March in-range from Aug 2026 is 2027-03.
    await month.selectOption("2027-03");
    await expect(month).toHaveValue("2027-03");
    await expect(month.locator("option:checked")).toHaveText("Mär 2027");

    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });
    await month.selectOption("2026-08");
    await expect(month.locator("option:checked")).toHaveText("avg 2026");
    await expect(month).not.toContainText(/август|August/i);
  });
});
