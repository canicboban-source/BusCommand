const { expect } = require("@playwright/test");
const { createEphemeralQaState, installQaHarness } = require("./qa-factory");

/** @deprecated use createEphemeralQaState — kept for older specs during migration */
function minimalDemoState() {
  const fixture = createEphemeralQaState({
    companyId: "qa-local",
    groupId: "101",
    saEmail: "sa@qa.local",
    caEmail: "ca@qa.local",
    dispoEmail: "dispo@qa.local",
    password: "Qa-test-ok-9",
    driverName: "E2E Driver",
    driverPin: "1234"
  });
  return fixture.state;
}

async function seedDemoState(page, state = minimalDemoState()) {
  const companyId = state.companyId
    || (state.companyAdmins && state.companyAdmins[0] && state.companyAdmins[0].companyId)
    || "qa-local";
  await installQaHarness(page, {
    companyId,
    state: { ...state, e2eFixture: true, companyId },
    saEmail: state.dispatchers?.find((d) => d.isSuperAdmin)?.email,
    caEmail: state.companyAdmins?.[0]?.email,
    dispoEmail: state.dispatchers?.find((d) => !d.isSuperAdmin)?.email,
    password: state.dispatchers?.find((d) => !d.isSuperAdmin)?.password
      || state.companyAdmins?.[0]?.password,
    driverName: state.drivers?.[0]?.name,
    driverPin: state.drivers?.[0]?.pin
  });
}

async function loginDispatcher(page, email = "dispo@qa.local", password = "Qa-test-ok-9") {
  if (!/staff\.html/i.test(page.url())) {
    await page.goto("/staff.html");
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
    await page.goto("/driver.html");
  }
  const tab = page.locator("#tab-driver-btn");
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
  }
  await page.locator("#login-driver-select").selectOption({ label: name });
  await page.locator("#login-driver-pin").fill(pin);
  await page.locator('[data-action="loginAsDriver"]').click();
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
  await expect(page.locator("#app-container")).not.toHaveClass(/hidden/, { timeout: 10000 });
}

async function loginCompanyAdmin(page, email = "ca@qa.local", password = "Qa-test-ok-9") {
  if (!/staff\.html/i.test(page.url())) {
    await page.goto("/staff.html");
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

async function loginSuperAdmin(page, email = "sa@qa.local", password = "Qa-test-ok-9") {
  return loginDispatcher(page, email, password);
}

module.exports = {
  minimalDemoState,
  seedDemoState,
  loginDispatcher,
  loginDriver,
  loginCompanyAdmin,
  loginSuperAdmin,
  createEphemeralQaState,
  installQaHarness
};
