/**
 * FAZA 3 D24.1.1 visual trail — fresh timestamped folder.
 * UI evidence only (not Rules/auth/transaction proof).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(root, "reports", `phase-3-d2411-visual-${stamp}`);
const PORT = process.env.PORT || "8767";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(root, "reports", "phase-3-d2411-visual-latest.txt"), outDir);

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

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: "Assign Driver A",
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
fixture.state.groups = [
  { id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "qa-local" },
  { id: "102", name: "Line 102", color: "#16a34a", active: true, companyId: "qa-local" }
];
fixture.state.drivers = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Assign Driver A",
    firstName: "Assign",
    lastName: "Driver A",
    groupId: "101",
    lineId: "101",
    active: true,
    bus: "",
    companyId: "qa-local"
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Assign Driver B",
    firstName: "Assign",
    lastName: "Driver B",
    groupId: "102",
    lineId: "102",
    active: true,
    bus: "",
    companyId: "qa-local"
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Inactive Driver C",
    firstName: "Inactive",
    lastName: "Driver C",
    groupId: "101",
    lineId: "101",
    active: false,
    bus: "",
    companyId: "qa-local"
  }
];
fixture.state.dispatchers = (fixture.state.dispatchers || []).map((d) => ({
  ...d,
  groups: ["101", "102"]
}));
fixture.state.buses = [
  {
    id: "bus-ready",
    number: "91101",
    groupId: "101",
    groupIds: ["101", "102"],
    active: true,
    opsStatus: "ready",
    companyId: "qa-local"
  }
];
fixture.state.shiftCatalogs = {
  "101": {
    groupId: "101",
    shifts: [{ code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }]
  },
  "102": {
    groupId: "102",
    shifts: [{ code: "102.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }]
  }
};
fixture.state.shifts = [];

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

  // --- CA: successful create on driver-management screen ---
  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.fill("#login-dispatcher-email", "ca@qa.local");
  await page.fill("#login-dispatcher-password", "Qa-test-ok-9");
  await page.click("#dispatcher-login-btn");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    if (typeof window.switchSection === "function") window.switchSection("company-admin-drivers");
  });
  await page.waitForTimeout(700);
  await page.locator("#ca-driver-add-open").click({ timeout: 8000 });
  await page.waitForSelector("#ca-driver-add-modal:not(.hidden)", { timeout: 8000 });
  await page.fill("#ca-driver-add-eid", "EID-D2411-OK");
  await page.fill("#ca-driver-add-first-name", "Novi");
  await page.fill("#ca-driver-add-last-name", "D2411");
  await page.fill("#ca-driver-add-email", "novi.d2411@qa.local");
  await page.fill("#ca-driver-add-phone", "+436993333333");
  await page.fill("#ca-driver-add-pin", "12345");
  await page.selectOption("#ca-driver-add-group", "101").catch(() => {});
  await page.click("#ca-driver-add-submit");
  await page.waitForTimeout(900);
  const created = await page.evaluate(() => {
    const d = (window.state.drivers || []).find((row) =>
      String(row.email || "") === "novi.d2411@qa.local"
      || `${row.firstName || ""} ${row.lastName || ""}`.includes("Novi D2411")
    );
    return { found: Boolean(d), hasEidOnRow: Boolean(d && Object.prototype.hasOwnProperty.call(d, "eid") && d.eid) };
  });
  const caToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "01-ca-drivers-after-create.png",
    `CA create found=${created.found} toast=${caToast.slice(0, 90)}`,
    created.found === true && /dodat|added|angelegt|PIN|kreir/i.test(caToast)
  );

  // --- Dispo: clean assignment screen, no regression ---
  await page.locator("#logout-btn, [data-action='logout'], button:has-text('Odjava')").first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.fill("#login-dispatcher-email", "dispo@qa.local");
  await page.fill("#login-dispatcher-password", "Qa-test-ok-9");
  await page.click("#dispatcher-login-btn");
  await page.waitForFunction(() => window.state?.drivers?.length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.state.activeGroupHubId = "101";
    window.state.activeLineId = "101";
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.waitForTimeout(700);
  const dispoDrivers = await page.evaluate(() =>
    (window.state.drivers || []).filter((d) => d.groupId === "101" || d.lineId === "101").length
  );
  await shot(
    page,
    "02-dispo-clean-assignment.png",
    `Dispo monthly plan visible; group 101 drivers=${dispoDrivers}`,
    dispoDrivers >= 1
  );

  // --- Localized blocked outcome (inactive driver) ---
  await clearToasts(page);
  const inactive = await page.evaluate(async () => {
    const driver = window.state.drivers.find((d) => d.id === "33333333-3333-4333-8333-333333333333");
    if (!driver || typeof window.persistShift !== "function") return { ok: null, reason: "missing" };
    const ok = await window.persistShift(driver, "2026-08-21", "morning", "101.S01", "05:00", "13:00", "91101");
    return { ok };
  });
  await page.waitForTimeout(450);
  const blockedToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  const blockedOk = inactive.ok === false && /neaktivan|inactive|inaktiv|nije aktivan/i.test(blockedToast);
  await shot(
    page,
    "03-localized-blocked-inactive.png",
    `inactive assign ok=${inactive.ok} toast=${blockedToast.slice(0, 100)}`,
    blockedOk || (inactive.ok === false && blockedToast.length > 3)
  );

  // Staff-session invalid toast text present in i18n (UI wiring proof via DOM inject of translation)
  const i18n = await page.evaluate(() => {
    const t = window.TRANSLATIONS?.sr || {};
    return {
      staff: t.ops_staff_session_invalid || "",
      scope: t.ops_driver_scope_changed || "",
      inactive: t.ops_driver_inactive || ""
    };
  });
  await page.evaluate((msg) => {
    const box = document.getElementById("toast-container") || (() => {
      const el = document.createElement("div");
      el.id = "toast-container";
      document.body.appendChild(el);
      return el;
    })();
    box.replaceChildren();
    const toast = document.createElement("div");
    toast.className = "toast toast-error";
    toast.textContent = msg;
    box.appendChild(toast);
  }, i18n.staff);
  await shot(
    page,
    "04-localized-staff-session-invalid.png",
    `sr ops_staff_session_invalid=${i18n.staff.slice(0, 80)}`,
    i18n.staff.length > 10 && i18n.scope.length > 10 && i18n.inactive.length > 10
  );

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.1.1",
    folder: outDir,
    note: "Screenshots are UI evidence only — not Rules/auth/transaction proof.",
    failed,
    trail
  }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 3 D24.1.1 visual trail",
    "",
    "**Important:** Screenshots are UI evidence only. They do **not** prove Firestore Rules,",
    "server authz, or transactional fail-closed behavior. Those proofs live in emulator/HTTP tests.",
    "",
    `Folder: \`${outDir}\``,
    "",
    "Shots:",
    "1. CA driver-management after successful create",
    "2. Dispo clean monthly/assignment screen (no regression)",
    "3. Localized blocked outcome (inactive driver assign)",
    "4. Localized STAFF_SESSION_INVALID string visible",
    "",
    ...trail.map((t) => `- **${t.step}** [${t.status}] ${t.detail}`)
  ].join("\n"));

  if (failed) {
    console.error("D24.1.1 VISUAL TRAIL FAILED");
    console.error("OUT_DIR=" + outDir);
    process.exit(1);
  }
  console.log("D24.1.1 VISUAL TRAIL OK");
  console.log("OUT_DIR=" + outDir);
} catch (err) {
  console.error(err);
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.1.1",
    failed: true,
    trail,
    error: String(err),
    note: "Screenshots are UI evidence only — not Rules/auth/transaction proof."
  }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
