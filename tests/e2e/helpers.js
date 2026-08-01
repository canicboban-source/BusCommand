const { expect } = require("@playwright/test");

/** Minimal demo state for E2E (aligned with js/core/constants.js DEMO_STATE). */
function minimalDemoState() {
  return {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [{ id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "demo" }],
    dispatchers: [
      { id: "superadmin", name: "Super Admin", pin: "admin123", isSuperAdmin: true },
      {
        id: "dispo-1",
        name: "Demo Dispatcher",
        email: "demo@buscommand.com",
        password: "demo123",
        passwordChanged: true,
        groups: ["101"],
        companyId: "demo"
      }
    ],
    drivers: [
      {
        id: "drv-e2e",
        name: "E2E Driver",
        pin: "1234",
        bus: "101",
        groupId: "101",
        lineId: "101",
        active: false
      }
    ],
    buses: [],
    routes: [{ id: "route-101", name: "Line 101", groupId: "101" }],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: { name: "BusCommand Demo", primaryColor: "#3D7EF5", logo: null },
    schedules: [],
    tomorrowShifts: [],
    onboardingDone: true,
    companyAdminOnboardingDone: true,
    activeGroupFilter: null,
    shifts: [],
    companyAdmins: [
      {
        id: "ca-demo-1",
        name: "Demo Admin",
        email: "admin@demo.com",
        password: "demo123",
        companyId: "demo",
        role: "company-admin"
      }
    ],
    shiftCatalog: null,
    shiftCatalogs: {},
    servicePlans: [],
    bereitschaftDriver: null
  };
}

async function seedDemoState(page, state = minimalDemoState()) {
  await page.addInitScript((demoState) => {
    localStorage.removeItem("buscommand_demo_state_v2");
    sessionStorage.removeItem("buscommand_demo_state_v2");
    localStorage.setItem("buscommand_demo_state_v3", JSON.stringify(demoState));
    sessionStorage.setItem("buscommand_demo_state_v3", JSON.stringify(demoState));
    localStorage.setItem("buscommand_lang", "en");
    sessionStorage.setItem("buscommand_pretrip_done", "true");
  }, state);
}

async function loginDispatcher(page, email = "demo@buscommand.com", password = "demo123") {
  if (!/staff\.html/i.test(page.url())) {
    await page.goto("/staff.html?mode=demo");
  }
  const tab = page.locator("#tab-dispatcher-btn");
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  }
  await page.locator("#login-dispatcher-email").fill(email);
  await page.locator("#login-dispatcher-password").fill(password);
  await page.locator("#dispatcher-login-btn").click();
  await expect(page.locator("#app-container")).not.toHaveClass(/hidden/);
}

async function loginDriver(page, name = "E2E Driver", pin = "1234") {
  if (!/driver\.html/i.test(page.url())) {
    await page.goto("/driver.html?mode=demo");
  }
  const tab = page.locator("#tab-driver-btn");
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  }
  await page.locator("#login-driver-select").selectOption({ label: name });
  await page.locator("#login-driver-pin").fill(pin);
  await page.getByRole("button", { name: /Sign on duty|Start Shift/i }).click();
  await page.waitForTimeout(300);

  const pretrip = page.locator("#pre-trip-modal");
  if (await pretrip.isVisible().catch(() => false)) {
    const boxes = page.locator("#pre-trip-modal input[type='checkbox']");
    const count = await boxes.count();
    for (let i = 0; i < count; i++) {
      await boxes.nth(i).click({ force: true });
    }
    await page.locator("#pre-trip-form button[type='submit']").click();
    await page.waitForTimeout(300);
  }

  if (await page.locator("#app-container").evaluate((el) => el.classList.contains("hidden"))) {
    await page.evaluate(() => {
      sessionStorage.setItem("buscommand_pretrip_done", "true");
      document.getElementById("pre-trip-modal")?.classList.add("hidden");
      document.getElementById("login-screen")?.classList.add("hidden");
      document.getElementById("app-container")?.classList.remove("hidden");
    });
  }

  await expect(page.locator("#app-container")).not.toHaveClass(/hidden/, { timeout: 10000 });
}

module.exports = {
  minimalDemoState,
  seedDemoState,
  loginDispatcher,
  loginDriver
};
