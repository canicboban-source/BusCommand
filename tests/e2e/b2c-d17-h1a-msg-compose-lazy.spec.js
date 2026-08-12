const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher } = require("./helpers.js");
const { createEphemeralQaState } = require("./qa-factory.js");

/** Payload chunk only — must not match msg-compose-loader-*.js (eager stub). */
const CHUNK_RE = /\/assets\/msg-compose-(?!loader-)[^/?#]+\.js(?:\?|$)/i;

test.describe.configure({ mode: "serial" });

function msgState(lang = "sr") {
  const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    driverName: "Msg QA Driver",
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
    companyId: "qa-local"
  }];
  return fixture.state;
}

async function openMessagesViaNav(page) {
  await page.locator('a.nav-item[data-action="switchSection"][data-action-args*="dispatcher-messages"]').click();
  await expect(page.locator("#dispatcher-messages")).not.toHaveClass(/hidden/, { timeout: 15000 });
}

test.describe("B2C-D17-H1-A lazy msg-compose", () => {
  test("cold Messages + compose form visible via real nav CTA", async ({ page }) => {
    test.setTimeout(60000);
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Unhandled|unhandledrejection/i.test(msg.text())) {
        unhandled.push(msg.text());
      }
    });

    await seedDemoState(page, msgState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });

    await openMessagesViaNav(page);

    await expect(page.locator("#dispatcher-message-form-messages")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#msg-compose-title")).toBeVisible();
    await expect(page.locator(".msg-compose-submit")).toBeVisible();

    const recipient = page.locator("#dispatcher-message-form-messages select").first();
    await expect(recipient).toBeVisible();
    const options = await recipient.locator("option").count();
    if (options > 1) await recipient.selectOption({ index: 1 });

    const detail = page.locator("#dispatcher-message-form-messages textarea").first();
    if (await detail.count()) {
      await detail.fill("H1-A QA detail", { timeout: 5000 });
    }

    expect(unhandled).toEqual([]);
  });

  test("controlled chunk failure shows localized toast; retry opens compose without reload", async ({ page }) => {
    test.setTimeout(60000);
    const unhandled = [];
    page.on("pageerror", (err) => unhandled.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Unhandled|unhandledrejection/i.test(msg.text())) {
        unhandled.push(msg.text());
      }
    });

    let allow = false;
    let blocked = 0;
    await page.route(CHUNK_RE, async (route) => {
      if (!allow) {
        blocked += 1;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await seedDemoState(page, msgState("sr"));
    await page.goto("/staff.html");
    await loginDispatcher(page);
    await page.evaluate(() => {
      if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    });

    await page.locator('a.nav-item[data-action="switchSection"][data-action-args*="dispatcher-messages"]').click();

    const toast = page.locator(".toast-error .toast-msg, .toast-error").first();
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).toContainText(/Modul za poruke nije učitan|try again|erneut versuchen/i);
    expect(blocked).toBeGreaterThanOrEqual(1);

    allow = true;
    await page.evaluate(() => {
      document.querySelectorAll(".toast, .toast-error").forEach((el) => el.remove());
    });
    await page.locator('a.nav-item[data-action="switchSection"][data-action-args*="dispatcher-messages"]').click();

    await expect(page.locator("#dispatcher-messages")).not.toHaveClass(/hidden/, { timeout: 20000 });
    await expect(page.locator("#dispatcher-message-form-messages")).toBeVisible({ timeout: 20000 });
    await expect(page.locator(".msg-compose-submit")).toBeVisible();
    expect(unhandled).toEqual([]);
  });
});
