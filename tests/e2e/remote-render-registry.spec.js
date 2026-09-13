const { test, expect } = require("@playwright/test");
const { seedDemoState, loginCompanyAdmin, loginDispatcher, loginDriver } = require("./helpers.js");

const LEGACY_JS = /https?:\/\/[^/]+\/(?:admin|dispatcher|driver)\/[^/?#]+\.js(?:\?|$)/i;

function attachNetworkWatch(page) {
  const legacy = [];
  const consoles = [];
  const pageErrors = [];
  const unhandled = [];
  page.on("request", (req) => {
    if (LEGACY_JS.test(req.url())) legacy.push(req.url());
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoles.push(String(msg.text()).slice(0, 240));
  });
  page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 240)));
  page.addInitScript(() => {
    window.addEventListener("unhandledrejection", (event) => {
      window.__bcUnhandled = window.__bcUnhandled || [];
      window.__bcUnhandled.push(String(event.reason || "reject").slice(0, 180));
    });
  });
  return {
    legacy,
    consoles,
    pageErrors,
    async unread() {
      return page.evaluate(() => window.__bcUnhandled || []);
    }
  };
}

test.describe("remote render registry", () => {
  test("CA overview and drivers remote update do not request leftover module URLs", async ({ page }) => {
    const watch = attachNetworkWatch(page);
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "domcontentloaded" });
    await loginCompanyAdmin(page);

    expect(await page.evaluate(() => typeof window.__bcHandleRemoteCollectionUpdateForTests)).toBe("function");
    expect(await page.evaluate(() => window.switchSection("company-admin-dashboard"))).toBe(true);
    await expect(page.locator("#company-admin-dashboard")).toBeVisible();

    const before = await page.locator("#ca-stat-drivers").textContent();
    await page.evaluate(() => {
      const companyId = window.currentUser.companyId || window.state.drivers[0]?.companyId;
      const groupId = window.state.groups[0]?.id;
      window.state.drivers = [
        ...window.state.drivers,
        {
          id: "drv-remote-render",
          name: "Remote Render Probe",
          companyId,
          groupId,
          active: true,
          codeActivated: true
        }
      ];
      window.__bcHandleRemoteCollectionUpdateForTests("drivers");
    });
    await expect.poll(async () => page.locator("#ca-stat-drivers").textContent()).not.toBe(before);

    expect(await page.evaluate(() => window.switchSection("company-admin-drivers"))).toBe(true);
    await expect(page.locator("#company-admin-drivers")).toBeVisible();
    await page.evaluate(() => window.__bcHandleRemoteCollectionUpdateForTests("drivers"));

    expect(watch.legacy).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
    expect(watch.consoles.filter((t) => /Failed to fetch dynamically|company-admin\.js/i.test(t))).toEqual([]);
    expect(await watch.unread()).toEqual([]);
  });

  test("dispatcher remote update does not request leftover dispatcher module URLs", async ({ page }) => {
    const watch = attachNetworkWatch(page);
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "domcontentloaded" });
    await loginDispatcher(page);
    expect(await page.evaluate(() => window.switchSection("dispatcher-dashboard"))).toBe(true);
    await expect(page.locator("#dispatcher-dashboard")).toBeVisible();
    await page.evaluate(() => window.__bcHandleRemoteCollectionUpdateForTests("drivers"));
    expect(watch.legacy).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
    expect(await watch.unread()).toEqual([]);
  });

  test("driver remote update does not request leftover driver module URLs", async ({ page }) => {
    const watch = attachNetworkWatch(page);
    await seedDemoState(page);
    await page.goto("/driver.html", { waitUntil: "domcontentloaded" });
    await loginDriver(page);
    expect(await page.evaluate(() => typeof window.__bcHandleRemoteCollectionUpdateForTests)).toBe("function");
    await page.evaluate(() => window.__bcHandleRemoteCollectionUpdateForTests("shifts"));
    expect(watch.legacy).toEqual([]);
    expect(watch.pageErrors).toEqual([]);
    expect(await watch.unread()).toEqual([]);
  });
});
