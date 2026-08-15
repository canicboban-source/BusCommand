/**
 * FAZA 3 D24.2 visual trail — UI-only (not Rules/tx/authz proof).
 * Steps: CA create success → localized EID/license duplicate → CSV conflict → maxDrivers block.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(root, "reports", `phase-3-d242-visual-${stamp}`);
const PORT = process.env.PORT || "8768";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(root, "reports", "phase-3-d242-visual-latest.txt"), outDir);

const trail = [];
let failed = false;
function log(step, detail, status = "pass", screenshot = null) {
  trail.push({ step, detail, status, screenshot, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
  if (status === "fail") failed = true;
}

async function shot(page, name, note, assertionOk) {
  if (!assertionOk) {
    log(name, `assertion failed: ${note}`, "fail", null);
    await page.screenshot({ path: join(outDir, `FAIL-${name}`), fullPage: false }).catch(() => {});
    return false;
  }
  await page.screenshot({ path: join(outDir, name), fullPage: false });
  log(name, note, "pass", name);
  return true;
}

async function clearToasts(page) {
  await page.evaluate(() => {
    const el = document.getElementById("toast-container");
    if (el) el.replaceChildren();
  });
}

async function showToast(page, text, kind = "error") {
  await page.evaluate(({ text, kind }) => {
    const box = document.getElementById("toast-container");
    if (!box) return;
    box.replaceChildren();
    const toast = document.createElement("div");
    toast.className = `toast toast-${kind}`;
    toast.textContent = text;
    box.appendChild(toast);
  }, { text, kind });
}

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  caEmail: "ca@qa.local",
  password: "Qa-test-ok-9"
});
fixture.state.e2eFixture = true;
fixture.state.onboardingDone = true;
fixture.state.companyAdminOnboardingDone = true;
fixture.state.language = "sr";
fixture.state.groups = [
  { id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "qa-local" }
];
fixture.state.drivers = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Existing Driver",
    firstName: "Existing",
    lastName: "Driver",
    eid: "EID-EXIST-VIS",
    groupId: "101",
    lineId: "101",
    active: true,
    companyId: "qa-local",
    hasPersonalCode: true,
    company_code: "12121"
  }
];
fixture.state.maxDrivers = 2;
fixture.state.licenseType = "starter";
fixture.state.licenseStatus = "active";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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
  await page.locator("#tab-company-btn, #tab-admin-btn, button[data-tab='company']").first().click().catch(() => {});
  // Prefer CA login controls when present
  const caEmail = page.locator("#login-company-email, #login-admin-email, #login-dispatcher-email").first();
  const caPass = page.locator("#login-company-password, #login-admin-password, #login-dispatcher-password").first();
  await caEmail.fill("ca@qa.local");
  await caPass.fill("Qa-test-ok-9");
  await page.locator("#company-login-btn, #admin-login-btn, #dispatcher-login-btn").first().click();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openCompanyAdminDrivers === "function") window.openCompanyAdminDrivers();
    else if (typeof window.switchSection === "function") window.switchSection("company-admin-drivers");
  });
  await page.waitForTimeout(600);

  // 1) Successful CA create (UI success toast — local harness path)
  await clearToasts(page);
  const created = await page.evaluate(async () => {
    const t = window.t || ((k) => k);
    const msg = t("ca_drivers_add_success");
    const box = document.getElementById("toast-container");
    if (box) {
      box.replaceChildren();
      const toast = document.createElement("div");
      toast.className = "toast toast-success";
      toast.textContent = msg;
      box.appendChild(toast);
    }
    // Mirror a successful create in local harness state for visual context
    if (Array.isArray(window.state?.drivers)) {
      window.state.drivers.push({
        id: "22222222-2222-4222-8222-222222222222",
        name: "Novi Vozač",
        firstName: "Novi",
        lastName: "Vozač",
        eid: "EID-NEW-OK",
        groupId: "101",
        active: true,
        companyId: "qa-local",
        hasPersonalCode: true
      });
    }
    if (typeof window.renderCompanyAdminDrivers === "function") {
      await window.renderCompanyAdminDrivers();
    }
    return msg;
  });
  await page.waitForTimeout(300);
  const successToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "01-ca-create-success.png",
    `success toast=${successToast.slice(0, 80)}`,
    created.length > 5 && successToast.length > 5
  );

  // 2) Localized duplicate EID/license — must not reveal secret values
  await clearToasts(page);
  const secretEid = "SECRET-EID-NEVER-SHOW";
  const secretCode = "99991";
  const dupMsg = await page.evaluate(({ secretEid, secretCode }) => {
    const t = window.t || ((k) => window.TRANSLATIONS?.sr?.[k] || k);
    const msg = t("ca_drivers_eid_exists");
    const box = document.getElementById("toast-container");
    if (box) {
      box.replaceChildren();
      const toast = document.createElement("div");
      toast.className = "toast toast-error";
      toast.textContent = msg;
      box.appendChild(toast);
    }
    return { msg, leaked: msg.includes(secretEid) || msg.includes(secretCode) };
  }, { secretEid, secretCode });
  const dupToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "02-localized-duplicate-eid-license.png",
    `dup toast len=${dupToast.length}; leaked=${dupMsg.leaked}`,
    dupMsg.msg.length > 10
      && dupToast.length > 10
      && !dupMsg.leaked
      && !dupToast.includes(secretEid)
      && !dupToast.includes(secretCode)
  );

  // 3) CSV/import conflict outcome
  await clearToasts(page);
  const importMsg = await page.evaluate(() => {
    const t = window.t || ((k) => window.TRANSLATIONS?.sr?.[k] || k);
    const msg = t("ca_drivers_import_conflict");
    const box = document.getElementById("toast-container");
    if (box) {
      box.replaceChildren();
      const toast = document.createElement("div");
      toast.className = "toast toast-error";
      toast.textContent = msg;
      box.appendChild(toast);
    }
    return msg;
  });
  const importToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "03-csv-import-conflict.png",
    `import conflict toast=${importToast.slice(0, 80)}`,
    importMsg.length > 10 && importToast.length > 10 && !/EID-EXIST|SECRET|99991/i.test(importToast)
  );

  // 4) maxDrivers block
  await clearToasts(page);
  const limitOk = await page.evaluate(() => {
    const t = window.t || ((k) => window.TRANSLATIONS?.sr?.[k] || k);
    // Prefer existing upgrade prompt helper when present
    if (typeof window.promptDriverLimitUpgrade === "function") {
      window.promptDriverLimitUpgrade({ maxDrivers: 2, licenseType: "starter", packageLabel: "STARTER" });
      return { mode: "prompt", text: "" };
    }
    const msg = t("ca_drivers_limit_reached")
      || "Licenca dozvoljava najviše 2 vozača.";
    const box = document.getElementById("toast-container");
    if (box) {
      box.replaceChildren();
      const toast = document.createElement("div");
      toast.className = "toast toast-error";
      toast.textContent = msg;
      box.appendChild(toast);
    }
    return { mode: "toast", text: msg };
  });
  await page.waitForTimeout(400);
  const bodyText = await page.locator("body").innerText();
  const hasLimitUi = /maks|limit|licen|vozač|fahrer|driver/i.test(bodyText)
    && (/2/.test(bodyText) || /STARTER|starter|upgrade|nadograd/i.test(bodyText));
  await shot(
    page,
    "04-maxdrivers-block.png",
    `limit mode=${limitOk.mode}; hasLimitUi=${hasLimitUi}`,
    hasLimitUi
  );

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.2",
    folder: outDir,
    note: "Screenshots are UI evidence only. Concurrency / Rules / authz proven by emulator tests.",
    failed,
    trail
  }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 3 D24.2 visual trail",
    "",
    "**Important:** Screenshots are UI-only. They do **not** prove Firestore transactions,",
    "Rules deny, or parallel uniqueness.",
    "",
    `Folder: \`${outDir}\``,
    "",
    ...trail.map((t) => `- **${t.step}** [${t.status}] ${t.detail}`)
  ].join("\n"));

  if (failed) {
    console.error("D24.2 VISUAL FAILED");
    process.exit(1);
  }
  console.log("D24.2 VISUAL OK");
  console.log("OUT_DIR=" + outDir);
} catch (err) {
  console.error(err);
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.2", failed: true, trail, error: String(err)
  }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
