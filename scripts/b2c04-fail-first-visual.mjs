/**
 * B2C-04 fail-first — prove monthly-plan Month control locale leak (Intl / non-Latin).
 * Half-screen, app language sr. Read-only against current dist until rebuild.
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
const LONG_NAME = "Aleksandar Petrovic-Milutinovic";

mkdirSync(outDir, { recursive: true });

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: LONG_NAME,
  dispoEmail: "dispo@qa.local",
  password: "Qa-test-ok-9",
  driverId: "11111111-1111-4111-8111-111111111111"
});
fixture.state.e2eFixture = true;
fixture.state.activeGroupHubId = "101";
fixture.state.activeLineId = "101";
fixture.state.onboardingDone = true;
fixture.state.companyAdminOnboardingDone = true;
fixture.state.language = "sr";
fixture.state.drivers[0].active = true;
fixture.state.drivers[0].name = LONG_NAME;
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

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 900 } });
const trail = [];
function log(step, detail, status = "info") {
  trail.push({ step, detail, status, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
}

try {
  await page.addInitScript(({ seeded, companyId }) => {
    window.__BUSCOMMAND_QA_HARNESS__ = true;
    window.__BUSCOMMAND_QA_COMPANY_ID__ = companyId;
    const key = "buscommand_state_" + companyId;
    localStorage.setItem(key, JSON.stringify(seeded));
    sessionStorage.setItem(key, JSON.stringify(seeded));
    localStorage.setItem("buscommand_lang", "sr");
  }, { seeded: fixture.state, companyId: "qa-local" });

  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill("dispo@qa.local");
  await page.locator("#login-dispatcher-password").fill("Qa-test-ok-9");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 20000 });

  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    window.state.activeLineId = "101";
    if (window.currentUser) window.currentUser.activeGroupId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.locator("#dispatcher-monthly-plans-full").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#monthly-month-select").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("#monthly-month-select").scrollIntoViewIfNeeded();

  // Prefer August 2026 if present for stable leak proof
  await page.evaluate(() => {
    const sel = document.getElementById("monthly-month-select");
    if (sel && [...sel.options].some((o) => o.value === "2026-08")) sel.value = "2026-08";
    if (typeof window.loadMonthlyPlanForDriver === "function") window.loadMonthlyPlanForDriver();
  });

  const shot = "00-fail-first-half-screen-locale-leak.png";
  await page.screenshot({ path: join(outDir, shot), fullPage: false });

  const info = await page.evaluate(() => {
    const sel = document.getElementById("monthly-month-select");
    const opt = sel?.selectedOptions?.[0];
    const label = (opt?.textContent || "").trim();
    const value = sel?.value || "";
    const tag = sel?.tagName || null;
    const type = sel?.getAttribute("type") || null;
    const changeAction = sel?.getAttribute("data-change-action") || null;
    const nativeMonthInputs = document.querySelectorAll('input[type="month"]').length;
    const cyrillic = /[а-яА-ЯёЁ]/.test(label);
    const hasAvg = /^avg\s+\d{4}$/i.test(label);
    const hasAugustEn = /August/i.test(label);
    return {
      tag,
      type,
      id: sel?.id || null,
      changeAction,
      value,
      label,
      cyrillic,
      hasAvg,
      hasAugustEn,
      nativeMonthInputs,
      optionCount: sel?.options?.length || 0
    };
  });

  const leak = info.cyrillic || info.hasAugustEn || (!info.hasAvg && /август|August|août/i.test(info.label));
  log("dom", JSON.stringify(info), leak ? "fail" : "info");
  log("renderer", "js/dispatcher/monthly-plans.js :: ensureMonthlyMonthOptions → Intl.DateTimeFormat(language,{month:long,year:numeric})", "info");
  log("handler", "data-change-action=loadMonthlyPlanForDriver on #monthly-month-select", "info");
  log("fail-first", leak
    ? `PROVEN locale leak label="${info.label}" value=${info.value}`
    : `NOT reproduced label="${info.label}"`, leak ? "fail" : "pass");

  writeFileSync(join(outDir, "FAIL-FIRST.json"), JSON.stringify({ trail, info, leak, screenshot: shot }, null, 2));
  writeFileSync(join(outDir, "FAIL-FIRST.md"), [
    "# B2C-04 fail-first",
    "",
    `- Element: \`#monthly-month-select\` (<${info.tag || "?"}>)`,
    `- Handler: \`${info.changeAction}\``,
    `- Renderer: \`ensureMonthlyMonthOptions\` via Intl.DateTimeFormat long month`,
    `- Selected value: \`${info.value}\``,
    `- Visible label: \`${info.label}\``,
    `- Cyrillic / non-contract: ${info.cyrillic}`,
    `- Native input[type=month] count: ${info.nativeMonthInputs}`,
    `- Screenshot: \`${shot}\``,
    `- Verdict: ${leak ? "FAIL (locale leak proven)" : "UNEXPECTED"}`,
    ""
  ].join("\n"));

  console.log(leak ? "FAIL_FIRST_PROVEN=1" : "FAIL_FIRST_PROVEN=0");
  process.exitCode = 0;
} catch (err) {
  log("error", String(err && err.stack || err), "fail");
  writeFileSync(join(outDir, "FAIL-FIRST.json"), JSON.stringify({ trail, error: String(err) }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
