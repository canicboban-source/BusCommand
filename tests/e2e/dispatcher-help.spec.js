const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher, minimalDemoState } = require("./helpers.js");

test.describe("Dispatcher help / self-recovery", () => {
  test("dispatcher sees Help button and escalate uses contact email", async ({ page }) => {
    const state = minimalDemoState();
    state.profile = { contactEmail: "owner@demo.local", country: "AT", timezone: "Europe/Vienna" };
    await seedDemoState(page, state);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page);

    const helpBtn = page.locator("#dispatcher-help-btn");
    await expect(helpBtn).toBeVisible();
    await expect(helpBtn).toContainText(/Help/i);
    await helpBtn.click();

    const modal = page.locator("#dispatcher-help-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/Refresh data/i);
    await expect(modal).toContainText(/Sign out and sign in/i);
    await expect(modal).toContainText(/Check network/i);
    await expect(modal).toContainText(/Drivers signed out/i);
    await expect(page.locator("#dispatcher-help-contact-email")).toHaveText("owner@demo.local");
    await expect(page.locator("#dispatcher-help-contact-missing")).toBeHidden();

    await page.locator("#dispatcher-help-note").fill("About 10 drivers signed out after a freeze.");
    await expect.poll(async () => {
      const href = await page.locator("#dispatcher-help-mailto").getAttribute("href");
      return decodeURIComponent(href || "");
    }).toContain("About 10 drivers");

    const href = await page.locator("#dispatcher-help-mailto").getAttribute("href");
    expect(href).toMatch(/^mailto:/i);
    const decoded = decodeURIComponent(href);
    expect(decoded).toMatch(/owner@demo\.local/);
    expect(decoded).toContain("Company ID");
    expect(decoded).toContain("demo");
    expect(decoded).not.toMatch(/password|pin\b/i);

    await page.locator('#dispatcher-help-modal .btn-icon-nav[data-action="closeDispatcherHelp"]').click();
    await expect(modal).toBeHidden();
  });

  test("company admin does not see dispatcher Help button", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
    await expect(page.locator("#company-admin-nav")).toBeVisible();
    await expect(page.locator("#dispatcher-help-btn")).toBeHidden();
  });
});
