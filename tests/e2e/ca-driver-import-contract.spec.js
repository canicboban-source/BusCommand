const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { seedDemoState, loginDispatcher } = require("./helpers.js");

const ROOT = path.join(__dirname, "../..");
const SHOT_DIR = process.env.R1_SHOT_DIR
  || path.join(process.env.TEMP || process.env.TMP || "/tmp", "BusCommand-MACHINE-FIX-01-R1", "screenshots");
const PIN_CSV = [
  "eid,last_name,first_name,email,phone,postal_code,pin",
  "IMP-X,Sample,Driver,driver01@example.invalid,+43100000000,1010,SECRET"
].join("\n");
const REJECT = {
  en: "Access codes cannot be imported from files.",
  de: "Zugangscodes werden nicht aus Dateien importiert.",
  sr: "Pristupni kodovi se ne uvoze fajlom."
};

fs.mkdirSync(SHOT_DIR, { recursive: true });

async function openCaDrivers(page, lang = "en") {
  await seedDemoState(page);
  await page.goto("/staff.html", { waitUntil: "networkidle" });
  await loginDispatcher(page, "ca@qa.local", "Qa-test-ok-9");
  await page.evaluate((value) => window.changeLanguage(value), lang);
  expect(await page.evaluate(() => window.switchSection("company-admin-drivers"))).toBe(true);
  await expect(page.locator("#company-admin-drivers")).toBeVisible();
  await page.locator("#ca-drivers-import-group").selectOption("101");
}

async function uploadPinCsv(page) {
  await page.locator("#ca-drivers-import-file").setInputFiles({
    name: "drivers-pin.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(PIN_CSV)
  });
}

test.describe("secure CA driver import contract", () => {
  test("company admin can preview CSV and XLSX with PLZ and without access codes", async ({ page }) => {
    await openCaDrivers(page, "en");
    await expect(page.locator(".company-drivers-security-note").filter({ has: page.locator('[data-i18n="ca_drivers_security_note"]') })).toHaveCount(1);
    await expect(page.locator('[data-i18n="ca_drivers_security_note"]')).toHaveText(
      "Access codes are not entered in the file. The system generates a one-time activation code."
    );
    await expect(page.locator('a[href="/templates/BusCommand_Drivers_Import_v1.csv"]')).toBeVisible();
    await expect(page.locator('a[href="/templates/BusCommand_Drivers_Import_v1.xlsx"]')).toBeVisible();

    await page.locator("#ca-drivers-import-file").setInputFiles({
      name: "drivers-contract.csv",
      mimeType: "text/csv",
      buffer: Buffer.from([
        "eid,last_name,first_name,email,phone,postal_code",
        "IMP-001,Sample,Driver,driver01@example.invalid,+43100000000,01010"
      ].join("\n"))
    });
    await expect(page.locator("#ca-drivers-import-preview")).toContainText("IMP-001");
    await expect(page.locator("#ca-drivers-import-preview")).toContainText("01010");
    await expect(page.locator("#ca-drivers-import-preview")).not.toContainText("1234");
    await page.locator("[data-action='clearCompanyDriversImport']").click();

    const xlsxPath = path.join(ROOT, "public/templates/BusCommand_Drivers_Import_v1.xlsx");
    await page.locator("#ca-drivers-import-file").setInputFiles(xlsxPath);
    await expect(page.locator("#ca-drivers-import-preview")).toContainText("EMP-001");
    await expect(page.locator("#ca-drivers-import-preview")).toContainText("1010");
    await expect(page.locator("#ca-drivers-import-preview")).not.toContainText("Initial_PIN");
  });

  for (const lang of ["en", "de", "sr"]) {
    test(`credential column is rejected in ${lang} with a single toast`, async ({ page }) => {
      await openCaDrivers(page, lang);
      const note = page.locator('[data-i18n="ca_drivers_security_note"]');
      await expect(note).toHaveCount(1);
      if (lang === "en") {
        await expect(note).toHaveText("Access codes are not entered in the file. The system generates a one-time activation code.");
      } else if (lang === "de") {
        await expect(note).toHaveText("Zugangscodes werden nicht in die Datei eingetragen. Das System erzeugt einen einmaligen Aktivierungscode.");
      } else {
        await expect(note).toHaveText("Pristupni kodovi se ne unose u fajl. Sistem generiše jednokratni aktivacioni kod.");
      }
      await page.screenshot({
        path: path.join(SHOT_DIR, `ca-import-security-note-${lang}.png`),
        fullPage: false
      });
      await uploadPinCsv(page);
      await expect(page.locator(".toast-error")).toHaveCount(1);
      await expect(page.locator(".toast-error")).toContainText(REJECT[lang]);
      await expect(page.locator(".toast-error")).not.toContainText("SECRET");
      await page.screenshot({
        path: path.join(SHOT_DIR, `ca-import-credential-reject-${lang}.png`),
        fullPage: false
      });
      if (lang === "en") {
        await uploadPinCsv(page);
        await expect(page.locator(".toast-error")).toHaveCount(1);
        await expect(page.locator(".toast-error")).toContainText(REJECT.en);
        await page.screenshot({
          path: path.join(SHOT_DIR, "ca-import-repeated-reject-single-toast.png"),
          fullPage: false
        });
      }
    });
  }

  test("dispatcher does not get the CA driver import action", async ({ page }) => {
    await seedDemoState(page);
    await page.goto("/staff.html", { waitUntil: "networkidle" });
    await loginDispatcher(page, "dispo@qa.local", "Qa-test-ok-9");
    await expect(page.locator("#company-admin-nav")).toHaveClass(/hidden/);
    await expect(page.locator('#dispatcher-nav:not(.hidden) [data-action-args*="company-admin-drivers"]')).toHaveCount(0);
    const opened = await page.evaluate(() => window.switchSection("company-admin-drivers"));
    expect(opened).toBe(false);
    await expect(page.locator("#company-admin-drivers")).toBeHidden();
    await expect(page.locator("#ca-drivers-import-file")).toBeHidden();
    await page.screenshot({
      path: path.join(SHOT_DIR, "dispatcher-driver-import-denied.png"),
      fullPage: false
    });
  });
});

test.describe("landing driver import downloads", () => {
  test("EN/DE/SR card copy and both template links return 200", async ({ page, request }) => {
    await page.goto("/");
    const csv = await request.get("/downloads/BusCommand_Driver_Roster_Template.csv");
    const xlsx = await request.get("/downloads/BusCommand_Driver_Roster_Template.xlsx");
    expect(csv.status()).toBe(200);
    expect(xlsx.status()).toBe(200);
    expect(await csv.text()).toMatch(/eid,last_name,first_name,email,phone,postal_code/);
    expect(await csv.text()).not.toMatch(/Initial_PIN|company_code|password/i);

    await page.locator("#lang-btn-en").click();
    await expect(page.locator("#dl-card5-title")).toHaveText("Driver Import");
    await expect(page.locator("#dl-card5-desc")).toContainText("Access codes are never imported from files");
    await page.locator("#lang-btn-de").click();
    await expect(page.locator("#dl-card5-title")).toHaveText("Fahrerimport");
    await expect(page.locator("#dl-card5-desc")).toContainText("Zugangscodes werden niemals aus Dateien importiert");
    await page.locator("#lang-btn-sr").click();
    await expect(page.locator("#dl-card5-title")).toHaveText("Uvoz vozača");
    await expect(page.locator("#dl-card5-desc")).toContainText("Pristupni kodovi se ne unose u fajl");
    await expect(page.locator("#dl-card5-btn")).toHaveAttribute("href", "/downloads/BusCommand_Driver_Roster_Template.csv");
    await expect(page.locator("#dl-card5-xlsx")).toHaveAttribute("href", "/downloads/BusCommand_Driver_Roster_Template.xlsx");
  });

  test("landing Downloads remains readable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/");
    await page.locator("#lang-btn-en").click();
    await expect(page.locator("#dl-card5-title")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);
    await page.locator("#dl-card5-title").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(SHOT_DIR, "landing-driver-downloads-mobile-320.png"),
      fullPage: false
    });
  });
});
