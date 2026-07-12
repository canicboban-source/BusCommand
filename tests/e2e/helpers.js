const { expect } = require("@playwright/test");

/** Minimal demo state for E2E (dispatcher + driver + grupa). */
function minimalDemoState() {
  return {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [{ id: "grp-1", name: "310", color: "#2DD4BF", active: true, companyId: "demo" }],
    dispatchers: [
      { id: "superadmin", name: "Super Admin", pin: "admin123", isSuperAdmin: true },
      {
        id: "dispo-1",
        name: "dispo 1",
        email: "dispo1@demo.com",
        password: "dispo123",
        passwordChanged: true,
        groups: ["grp-1"],
        companyId: "demo"
      }
    ],
    drivers: [
      {
        id: "drv-e2e",
        name: "E2E Driver",
        pin: "1234",
        bus: "104",
        groupId: "grp-1",
        active: false
      }
    ],
    buses: [],
    routes: [{ id: "route-1", name: "Line 310", groupId: "grp-1" }],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: { name: "BusCommand Demo", primaryColor: "#2DD4BF", logo: null },
    schedules: [],
    tomorrowShifts: [],
    onboardingDone: true,
    companyAdminOnboardingDone: true,
    activeGroupFilter: null,
    shifts: [],
    companyAdmins: [
      {
        id: "ca-demo-1",
        name: "Ana Kovačević",
        email: "admin@demo.com",
        password: "demo123",
        companyId: "demo",
        role: "company-admin"
      }
    ],
    shiftCatalog: null,
    shiftCatalogs: {},
    bereitschaftDriver: null
  };
}

async function seedDemoState(page, state = minimalDemoState()) {
  await page.addInitScript((demoState) => {
    localStorage.setItem("buscommand_demo_state_v2", JSON.stringify(demoState));
    localStorage.setItem("buscommand_lang", "en");
    sessionStorage.setItem("buscommand_pretrip_done", "true");
  }, state);
}

async function loginDispatcher(page, email = "dispo1@demo.com", password = "dispo123") {
  await page.locator("#tab-dispatcher-btn").click();
  await page.locator("#login-dispatcher-email").fill(email);
  await page.locator("#login-dispatcher-password").fill(password);
  await page.locator("#dispatcher-login-btn").click();
  await expect(page.locator("#app-container")).not.toHaveClass(/hidden/);
}

async function loginDriver(page, name = "E2E Driver", pin = "1234") {
  await page.locator("#tab-driver-btn").click();
  await page.locator("#login-driver-select").selectOption({ label: name });
  await page.locator("#login-driver-pin").fill(pin);
  await page.locator("#driver-login-form .btn-primary").click();
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
