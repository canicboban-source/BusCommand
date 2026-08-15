/**
 * B2C-04 after visual — sr/en/de compact month on half-screen monthly-plan panel.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "b2c04-month-locale-visual");
const PORT = process.env.PORT || "8772";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const DRIVER = "Aleksandar Petrovic-Milutinovic";

mkdirSync(outDir, { recursive: true });
const trail = [];
function log(step, detail, status = "pass", screenshot = null) {
  trail.push({ step, detail, status, screenshot, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
}

function makeState(lang) {
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
  fixture.state.onboardingDone = true;
  fixture.state.companyAdminOnboardingDone = true;
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

const browser = await chromium.launch({ headless: true });

async function shotLang(lang, expectedLabel, fileName) {
  const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
  const seeded = makeState(lang);
  await page.addInitScript(({ seededState, companyId, uiLang }) => {
    window.__BUSCOMMAND_QA_HARNESS__ = true;
    window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
    const key = "buscommand_state_" + companyId;
    localStorage.setItem(key, JSON.stringify(seededState));
    sessionStorage.setItem(key, JSON.stringify(seededState));
    localStorage.setItem("buscommand_lang", uiLang);
  }, { seededState: seeded, companyId: "qa-local", uiLang: lang });

  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
  await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 20000 });
  await page.evaluate((uiLang) => {
    window.state.activeGroupHubId = "101";
    window.state.activeLineId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage(uiLang);
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  }, lang);
  await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#monthly-month-select").waitFor({ state: "visible" });
  await page.locator("#monthly-month-select").selectOption("2026-08");
  await page.locator("#monthly-month-select").scrollIntoViewIfNeeded();

  const info = await page.evaluate(() => {
    const sel = document.getElementById("monthly-month-select");
    const label = (sel?.selectedOptions?.[0]?.textContent || "").trim();
    return {
      value: sel?.value || "",
      label,
      cyrillic: /[а-яА-ЯёЁ]/.test(label),
      aria: sel?.getAttribute("aria-label") || ""
    };
  });
  const ok = info.value === "2026-08"
    && info.label === expectedLabel
    && !info.cyrillic
    && !/август|August/i.test(info.label);

  await page.screenshot({ path: join(outDir, fileName), fullPage: false });
  log(fileName, JSON.stringify(info), ok ? "pass" : "fail", fileName);
  await page.close();
  return ok;
}

try {
  const sr = await shotLang("sr", "avg 2026", "01-after-sr-avg-2026.png");
  const en = await shotLang("en", "Aug 2026", "02-after-en-Aug-2026.png");
  const de = await shotLang("de", "Aug 2026", "03-after-de-Aug-2026.png");
  writeFileSync(join(outDir, "AFTER.json"), JSON.stringify({ trail, sr, en, de }, null, 2));
  writeFileSync(join(outDir, "TRAIL.md"), [
    "# B2C-04 visual trail",
    "",
    "- 00 fail-first: `00-fail-first-half-screen-locale-leak.png` (`август 2026.`)",
    `- 01 sr: avg 2026 → ${sr}`,
    `- 02 en: Aug 2026 → ${en}`,
    `- 03 de: Aug 2026 → ${de}`,
    ""
  ].join("\n"));
  if (!sr || !en || !de) process.exitCode = 1;
} catch (err) {
  log("error", String(err && err.stack || err), "fail");
  process.exitCode = 1;
} finally {
  await browser.close();
}
