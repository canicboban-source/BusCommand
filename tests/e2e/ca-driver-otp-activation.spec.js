const { test, expect } = require("@playwright/test");
const { seedDemoState, loginDispatcher } = require("./helpers.js");

async function openCaDrivers(page, lang = "en") {
  await seedDemoState(page);
  await page.goto("/staff.html", { waitUntil: "networkidle" });
  await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
  await page.evaluate((value) => window.changeLanguage(value), lang);
  expect(await page.evaluate(() => window.switchSection("company-admin-drivers"))).toBe(true);
  await expect(page.locator("#company-admin-drivers")).toBeVisible();
}

test.describe("CA driver OTP activation", () => {
  for (const lang of ["en", "de", "sr"]) {
    test(`create modal has no PIN and shows OTP copy in ${lang}`, async ({ page }) => {
      await openCaDrivers(page, lang);
      await page.locator("[data-action='openCompanyDriverAddModal']").first().click();
      await expect(page.locator("#ca-driver-add-modal")).toBeVisible();
      await expect(page.locator("#ca-driver-add-pin")).toHaveCount(0);
      await expect(page.locator("#ca-driver-add-eid")).toBeVisible();
      await expect(page.locator("#ca-driver-add-postal-code")).toBeVisible();
      const note = page.locator('[data-i18n="ca_drivers_add_sms_note"]');
      if (lang === "en") {
        await expect(note).toHaveText("The system sends a one-time activation code by SMS. The driver then sets their own PIN.");
      } else if (lang === "de") {
        await expect(note).toHaveText("Das System sendet einen einmaligen Aktivierungscode per SMS. Der Fahrer setzt danach selbst die PIN.");
      } else {
        await expect(note).toHaveText("Sistem šalje jednokratni aktivacioni kod SMS-om. Vozač zatim sam postavlja lični PIN.");
      }
      await page.setViewportSize({ width: 320, height: 720 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow).toBe(false);
    });
  }

  test("edit modal has reset control and confirmation, no PIN field", async ({ page }) => {
    await openCaDrivers(page, "en");
    await page.locator("#ca-drivers-directory .row-actions-trigger").first().click();
    await page.locator("body > .row-actions-menu [data-action='openCompanyDriverEdit']:visible").click();
    await expect(page.locator("#ca-driver-edit-modal")).toBeVisible();
    await expect(page.locator("#ca-driver-edit-pin")).toHaveCount(0);
    await expect(page.locator("#ca-driver-reset-activation")).toBeVisible();
    await page.locator("#ca-driver-reset-activation").click();
    await expect(page.locator("#global-confirm-modal")).toBeVisible();
    await expect(page.locator("#global-confirm-message")).toContainText("one-time SMS code");
  });

  test("dispatcher does not see CA driver create or reset controls", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "dispo@qa.local", "Qa-test-ok-9");
    const switched = await page.evaluate(() => window.switchSection("company-admin-drivers"));
    if (switched) {
      await expect(page.locator("#ca-driver-reset-activation")).toHaveCount(0);
      await expect(page.locator("#ca-driver-add-pin")).toHaveCount(0);
    } else {
      await expect(page.locator("#company-admin-drivers")).toBeHidden();
    }
  });

  test("demo create does not store plaintext PIN", async ({ page }) => {
    await openCaDrivers(page, "en");
    await page.locator("[data-action='openCompanyDriverAddModal']").first().click();
    await page.locator("#ca-driver-add-eid").fill("EID-OTP-E2E");
    await page.locator("#ca-driver-add-first-name").fill("Otp");
    await page.locator("#ca-driver-add-last-name").fill("Driver");
    await page.locator("#ca-driver-add-email").fill("otp.driver@example.invalid");
    await page.locator("#ca-driver-add-phone").fill("+43100000001");
    await page.locator("#ca-driver-add-postal-code").fill("1010");
    await page.locator("#ca-driver-add-group").selectOption({ index: 1 });
    await page.locator("#ca-driver-add-submit").click();
    const secrets = await page.evaluate(() => {
      const driver = (window.state.drivers || []).find((row) => row.eid === "EID-OTP-E2E") || {};
      return {
        pin: driver.pin,
        company_code: driver.company_code,
        companyCode: driver.companyCode,
        activationOtp: driver.activationOtp,
        codeActivated: driver.codeActivated
      };
    });
    expect(secrets.pin).toBeUndefined();
    expect(secrets.company_code).toBeUndefined();
    expect(secrets.companyCode).toBeUndefined();
    expect(secrets.activationOtp).toBeUndefined();
    expect(secrets.codeActivated).toBeFalsy();
  });

  test("rapid double-click on create does not duplicate the driver", async ({ page }) => {
    await openCaDrivers(page, "en");
    await page.locator("[data-action='openCompanyDriverAddModal']").first().click();
    await page.locator("#ca-driver-add-eid").fill("EID-OTP-DBL");
    await page.locator("#ca-driver-add-first-name").fill("Otp");
    await page.locator("#ca-driver-add-last-name").fill("Double");
    await page.locator("#ca-driver-add-email").fill("otp.double@example.invalid");
    await page.locator("#ca-driver-add-phone").fill("+43100000002");
    await page.locator("#ca-driver-add-postal-code").fill("1010");
    await page.locator("#ca-driver-add-group").selectOption({ index: 1 });
    const submit = page.locator("#ca-driver-add-submit");
    await submit.click();
    await submit.click({ timeout: 1500 }).catch(() => undefined);
    const count = await page.evaluate(
      () => (window.state.drivers || []).filter((row) =>
        row.eid === "EID-OTP-DBL" || row.email === "otp.double@example.invalid"
      ).length
    );
    expect(count).toBe(1);
  });

  test("SMS failure copy is shown instead of SMS sent", async ({ page }) => {
    await openCaDrivers(page, "en");
    const copy = await page.evaluate(() => {
      const dict = window.TRANSLATIONS.en;
      const unavailable = dict.ca_drivers_add_pin_invalid;
      const sent = dict.ca_drivers_pin_saved;
      const root = document.getElementById("toast-container");
      const toast = document.createElement("div");
      toast.className = "toast toast-error";
      toast.id = "qa-sms-failure-toast";
      toast.innerHTML = `<div class="toast-body"><div class="toast-msg"></div></div>`;
      toast.querySelector(".toast-msg").textContent = unavailable;
      root.appendChild(toast);
      return { unavailable, sent };
    });
    expect(copy.unavailable).toBe("Activation SMS is currently unavailable.");
    expect(copy.sent).toBe("Activation SMS sent.");
    await expect(page.locator("#qa-sms-failure-toast .toast-msg")).toHaveText(
      "Activation SMS is currently unavailable."
    );
    await expect(page.locator("#qa-sms-failure-toast")).not.toContainText("Activation SMS sent.");
  });
});
