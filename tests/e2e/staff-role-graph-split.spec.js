const { test, expect } = require("@playwright/test");
const { seedDemoState, loginCompanyAdmin, loginDispatcher } = require("./helpers.js");

const ROLE_CA = /install-company-admin-role/i;
const ROLE_DISPO = /install-dispatcher-role/i;
/** SA panel payload only — not the tiny superadmin-loader utility in the initial graph. */
const ROLE_SA_PANEL = /\/assets\/superadmin-(?!loader-)[A-Za-z0-9_-]+\.js/i;
const LEGACY_JS = /https?:\/\/[^/]+\/(?:admin|dispatcher)\/[^/?#]+\.js(?:\?|$)/i;

function attachWatch(page) {
  const requests = [];
  const legacy = [];
  page.on("request", (req) => {
    const url = req.url();
    requests.push(url);
    if (LEGACY_JS.test(url)) legacy.push(url);
  });
  return { requests, legacy };
}

test.describe("WIDE-36 staff role graph split", () => {
  test("unauthenticated /staff does not fetch CA or Dispatcher role chunks", async ({ page }) => {
    const watch = attachWatch(page);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await expect(page.locator("#login-screen")).toBeVisible();
    expect(watch.requests.some((u) => ROLE_CA.test(u))).toBe(false);
    expect(watch.requests.some((u) => ROLE_DISPO.test(u))).toBe(false);
    expect(watch.requests.some((u) => ROLE_SA_PANEL.test(u))).toBe(false);
  });

  test("CA login loads CA graph but not Dispatcher or Super Admin panel", async ({ page }) => {
    const watch = attachWatch(page);
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "domcontentloaded" });
    await loginCompanyAdmin(page);
    await expect(page.locator("#company-admin-dashboard")).toBeVisible();

    expect(watch.requests.some((u) => ROLE_CA.test(u))).toBe(true);
    expect(watch.requests.some((u) => ROLE_DISPO.test(u))).toBe(false);
    expect(watch.requests.some((u) => ROLE_SA_PANEL.test(u))).toBe(false);

    for (const section of [
      "company-admin-dashboard",
      "company-admin-drivers",
      "company-admin-groups",
      "company-admin-service-plan"
    ]) {
      expect(await page.evaluate((id) => window.switchSection(id), section)).toBe(true);
      await expect(page.locator(`#${section}`)).toBeVisible();
    }
  });

  test("Dispatcher login loads Dispatcher graph but not CA or Super Admin panel", async ({ page }) => {
    const watch = attachWatch(page);
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "domcontentloaded" });
    await loginDispatcher(page);
    await expect(page.locator("#dispatcher-dashboard")).toBeVisible();

    expect(watch.requests.some((u) => ROLE_DISPO.test(u))).toBe(true);
    expect(watch.requests.some((u) => ROLE_CA.test(u))).toBe(false);
    expect(watch.requests.some((u) => ROLE_SA_PANEL.test(u))).toBe(false);

    for (const section of [
      "dispatcher-dashboard",
      "dispatcher-daily-plan-pick",
      "dispatcher-reports"
    ]) {
      expect(await page.evaluate((id) => window.switchSection(id), section)).toBe(true);
      await expect(page.locator(`#${section}`)).toBeVisible();
    }

    expect(await page.evaluate(() => window.switchSection("dispatcher-live-map-section"))).toBe(true);
  });

  test("remote-render after CA login has no leftover /admin/*.js 404s", async ({ page }) => {
    const watch = attachWatch(page);
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "domcontentloaded" });
    await loginCompanyAdmin(page);
    expect(await page.evaluate(() => window.switchSection("company-admin-dashboard"))).toBe(true);
    await page.evaluate(() => {
      window.state.drivers = [
        ...window.state.drivers,
        {
          id: "drv-role-graph-remote",
          name: "Role Graph Remote",
          companyId: window.currentUser.companyId,
          groupId: window.state.groups[0]?.id,
          active: true,
          codeActivated: true
        }
      ];
      window.__bcHandleRemoteCollectionUpdateForTests("drivers");
    });
    expect(watch.legacy).toEqual([]);
  });

  test("repeated ensureStaffRoleGraph does not double-register section handlers", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "domcontentloaded" });
    await loginCompanyAdmin(page);

    const result = await page.evaluate(async () => {
      const ensure = window.__bcEnsureStaffRoleGraphForTests;
      const isInstalled = window.__bcIsStaffRoleGraphInstalledForTests;
      if (typeof ensure !== "function") {
        return { error: "missing-ensure-hook" };
      }
      await ensure("company-admin");
      await ensure("company-admin");
      return {
        installed: isInstalled("company-admin"),
        switched: window.switchSection("company-admin-dashboard")
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.installed).toBe(true);
    expect(result.switched).toBe(true);
    await expect(page.locator("#company-admin-dashboard")).toBeVisible();
  });
});
