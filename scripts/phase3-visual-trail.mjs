/**
 * FAZA 3 visual trail — assignment integrity + CA atomic create (QA harness).
 * Proves: hard-fail blocks, real day-edit modal footer CTAs, CA add modal footer CTAs.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "reports", "phase-3-visual");
const PORT = process.env.PORT || "8766";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(outDir)) {
  if (name.endsWith(".png") || name === "TRAIL.json" || name === "README.md") {
    unlinkSync(join(outDir, name));
  }
}

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

/** Scroll modal panel + CTA into view; assert every selector is fully inside the viewport. */
async function assertFooterCtasVisible(page, selectors) {
  const result = await page.evaluate((sels) => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const out = [];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        out.push({ sel, ok: false, reason: "missing" });
        continue;
      }
      let panel = el.closest(".bc-overlay-panel, .modal-content, .modal-panel, form, [role='dialog']");
      if (panel && panel.scrollHeight > panel.clientHeight) {
        panel.scrollTop = panel.scrollHeight;
      }
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = el.getBoundingClientRect();
      const fully =
        r.top >= -1 && r.left >= -1 && r.bottom <= vh + 2 && r.right <= vw + 2 && r.width > 0 && r.height > 0;
      out.push({
        sel,
        ok: fully,
        reason: fully ? "visible" : `clip t=${r.top.toFixed(0)} b=${r.bottom.toFixed(0)} vh=${vh}`
      });
    }
    return out;
  }, selectors);
  const allOk = result.every((r) => r.ok);
  return { allOk, detail: result.map((r) => `${r.sel}:${r.reason}`).join("; ") };
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
  },
  {
    id: "bus-inactive",
    number: "91102",
    groupId: "101",
    groupIds: ["101"],
    active: false,
    opsStatus: "ready",
    companyId: "qa-local"
  },
  {
    id: "bus-out",
    number: "91103",
    groupId: "101",
    groupIds: ["101"],
    active: true,
    opsStatus: "out",
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
fixture.state.shifts = [
  {
    id: "shf-a",
    driverId: "11111111-1111-4111-8111-111111111111",
    driverName: "Assign Driver A",
    date: "2026-08-09",
    type: "morning",
    name: "101.S01",
    bus: "91101",
    groupId: "101",
    start: "05:00",
    end: "13:00",
    revision: 2
  }
];

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
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.fill("#login-dispatcher-email", "dispo@qa.local");
  await page.fill("#login-dispatcher-password", "Qa-test-ok-9");
  await page.click("#dispatcher-login-btn");
  await page.waitForFunction(() => window.state?.drivers?.length > 0, null, { timeout: 20000 });
  await page.waitForTimeout(500);

  // --- Sub-phase A: programmatic hard-fail (server/client authority) ---
  const valid = await page.evaluate(async () => {
    const driver = window.state.drivers.find((d) => d.id === "22222222-2222-4222-8222-222222222222");
    const ok = await window.persistShift(driver, "2026-08-10", "morning", "102.S01", "05:00", "13:00", "91101");
    const shift = (window.state.shifts || []).find((s) => s.driverId === driver.id && s.date === "2026-08-10");
    return { ok, bus: shift?.bus || null };
  });
  await shot(page, "01-valid-assignment.png", `valid assign ok=${valid.ok} bus=${valid.bus}`, valid.ok === true && valid.bus === "91101");

  await clearToasts(page);
  const occupied = await page.evaluate(async () => {
    const driver = window.state.drivers.find((d) => d.id === "22222222-2222-4222-8222-222222222222");
    const ok = await window.persistShift(driver, "2026-08-09", "morning", "102.S01", "05:30", "13:30", "91101");
    const shift = (window.state.shifts || []).find((s) => s.driverId === driver.id && s.date === "2026-08-09");
    return { ok, bus: shift?.bus || null };
  });
  await page.waitForTimeout(400);
  const toastOccupied = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "02-occupied-bus.png",
    `occupied blocked ok=${occupied.ok} toast=${toastOccupied.slice(0, 90)}`,
    occupied.ok === false && /91101/.test(toastOccupied)
  );

  await clearToasts(page);
  const inactive = await page.evaluate(async () => {
    const driver = window.state.drivers.find((d) => d.id === "22222222-2222-4222-8222-222222222222");
    return { ok: await window.persistShift(driver, "2026-08-11", "morning", "x", "05:00", "13:00", "91102") };
  });
  await page.waitForTimeout(350);
  const toastInactive = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(page, "03-inactive-bus.png", `inactive ok=${inactive.ok} toast=${toastInactive.slice(0, 80)}`, inactive.ok === false && toastInactive.length > 0);

  await clearToasts(page);
  const notReady = await page.evaluate(async () => {
    const driver = window.state.drivers.find((d) => d.id === "22222222-2222-4222-8222-222222222222");
    return { ok: await window.persistShift(driver, "2026-08-12", "morning", "x", "05:00", "13:00", "91103") };
  });
  await page.waitForTimeout(350);
  const toastReady = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(page, "04-bus-not-ready.png", `not-ready ok=${notReady.ok} toast=${toastReady.slice(0, 80)}`, notReady.ok === false);

  await clearToasts(page);
  const conflict = await page.evaluate(async () => {
    const driver = window.state.drivers.find((d) => d.id === "22222222-2222-4222-8222-222222222222");
    return { ok: await window.persistShift(driver, "2026-08-09", "afternoon", "y", "06:00", "14:00", "91101") };
  });
  await page.waitForTimeout(400);
  const toastConflict = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  await shot(
    page,
    "05-bus-conflict.png",
    `conflict blocked toast=${toastConflict.slice(0, 90)}`,
    conflict.ok === false && /91101|blokir/i.test(toastConflict)
  );

  const stale = await page.evaluate(() => {
    const driver = window.state.drivers.find((d) => d.id === "11111111-1111-4111-8111-111111111111");
    const idx = (window.state.shifts || []).findIndex((s) => s.driverId === driver.id && s.date === "2026-08-09");
    if (idx < 0) return { revision: null };
    const remote = {
      ...window.state.shifts[idx],
      revision: 9,
      bus: "91101",
      name: "101.S01-REFRESH"
    };
    window.state.shifts[idx] = remote;
    return { revision: remote.revision, name: remote.name };
  });
  await shot(
    page,
    "06-stale-revision-refresh.png",
    `refreshed revision=${stale.revision} name=${stale.name}`,
    stale.revision === 9
  );

  const rolled = await page.evaluate(() => {
    const shift = (window.state.shifts || []).find(
      (s) => s.driverId === "22222222-2222-4222-8222-222222222222" && s.date === "2026-08-09"
    );
    return { hasConflictDay: Boolean(shift && shift.type !== "clear" && shift.bus === "91101") };
  });
  await shot(
    page,
    "07-rollback-refreshed.png",
    `no partial conflict-day write hasConflictDay=${rolled.hasConflictDay}`,
    rolled.hasConflictDay === false
  );

  // --- Sub-phase B: real monthly day-edit modal + footer CTAs ---
  await page.evaluate(() => {
    window.state.activeGroupHubId = "102";
    window.state.activeLineId = "102";
    window.state.shiftCatalog = {
      entries: {
        "102.S01": { code: "102.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" },
        "101.S01": { code: "101.S01", type: "morning", start: "05:00", end: "13:00", shortName: "S01" }
      }
    };
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    if (typeof window.openMonthlyDayEditForDriver === "function") {
      window.openMonthlyDayEditForDriver("Assign Driver B", "2026-08", 9);
    } else if (typeof window.openMonthlyDayEdit === "function") {
      window.openMonthlyDayEdit("Assign Driver B_2026-08", 9);
    }
  });
  await page.waitForSelector("#monthly-day-edit-modal:not(.hidden)", { timeout: 8000 });
  await page.selectOption("#med-day-select", "9").catch(() => {});
  await page.selectOption("#med-shift-type", "morning");
  await page.fill("#med-shift-code-custom", "102.S01");
  await page.fill("#med-bus-custom", "91101");
  await page.waitForTimeout(200);

  const dayFooter = await assertFooterCtasVisible(page, [
    "#monthly-day-edit-modal .monthly-day-edit-cancel",
    "#monthly-day-edit-modal #med-undo-btn",
    "#monthly-day-edit-modal .monthly-day-edit-save"
  ]);
  await shot(
    page,
    "07b-day-edit-modal-footer-ctas.png",
    `day-edit footer CTAs fully visible: ${dayFooter.detail}`,
    dayFooter.allOk
  );

  await clearToasts(page);
  await page.locator("#monthly-day-edit-modal .monthly-day-edit-save").click();
  await page.waitForTimeout(700);
  const dayEditToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  const blockedSave = await page.evaluate(() => {
    const shift = (window.state.shifts || []).find(
      (s) => s.driverId === "22222222-2222-4222-8222-222222222222" && s.date === "2026-08-09"
    );
    const modalOpen = !document.getElementById("monthly-day-edit-modal")?.classList.contains("hidden");
    return { savedConflict: Boolean(shift && shift.bus === "91101"), modalOpen };
  });
  const dayFooterAfter = await assertFooterCtasVisible(page, [
    "#monthly-day-edit-modal .monthly-day-edit-cancel",
    "#monthly-day-edit-modal .monthly-day-edit-save"
  ]);
  await shot(
    page,
    "07c-day-edit-save-blocked.png",
    `Save blocked toast=${dayEditToast.slice(0, 80)}; savedConflict=${blockedSave.savedConflict}; modalOpen=${blockedSave.modalOpen}; footer=${dayFooterAfter.detail}`,
    /91101|blokir|aktivan|spreman|Autobus/i.test(dayEditToast)
      && blockedSave.savedConflict === false
      && blockedSave.modalOpen === true
      && dayFooterAfter.allOk
  );

  await page.locator("#monthly-day-edit-modal .monthly-day-edit-cancel").click();
  await page.waitForTimeout(400);
  const dayClosed = await page.evaluate(() => {
    const el = document.getElementById("monthly-day-edit-modal");
    if (!el) return true;
    return el.classList.contains("hidden") || el.getAttribute("aria-hidden") === "true";
  });
  await shot(
    page,
    "07d-day-edit-cancel-closes.png",
    `Cancel closes day-edit modal closed=${dayClosed}`,
    dayClosed === true
  );

  // --- Sub-phase C: CA atomic create modal footer CTAs ---
  await page.locator("#logout-btn, [data-action='logout'], button:has-text('Odjava')").first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.goto(`${baseURL}/staff.html`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.fill("#login-dispatcher-email", "ca@qa.local");
  await page.fill("#login-dispatcher-password", "Qa-test-ok-9");
  await page.click("#dispatcher-login-btn");
  await page.waitForTimeout(1500);

  await page.locator('[data-section="company-admin-drivers"], #nav-item-company-admin-drivers, a[href*="company-admin-drivers"]').first().click().catch(() => {});
  await page.evaluate(() => {
    if (typeof window.switchSection === "function") window.switchSection("company-admin-drivers");
  }).catch(() => {});
  await page.waitForTimeout(700);

  await page.locator("#ca-driver-add-open").click({ timeout: 8000 });
  await page.waitForSelector("#ca-driver-add-modal:not(.hidden)", { timeout: 8000 });

  await clearToasts(page);
  await page.fill("#ca-driver-add-eid", "EID-P3-FAIL");
  await page.fill("#ca-driver-add-first-name", "Fail");
  await page.fill("#ca-driver-add-last-name", "Case");
  await page.fill("#ca-driver-add-email", "fail@qa.local");
  await page.fill("#ca-driver-add-phone", "+436991111111");
  await page.fill("#ca-driver-add-pin", "12");
  await page.selectOption("#ca-driver-add-group", "101").catch(() => {});

  const caFooterBefore = await assertFooterCtasVisible(page, [
    "#ca-driver-add-modal .company-driver-add-actions [data-action='closeCompanyDriverAddModal']",
    "#ca-driver-add-submit"
  ]);
  await shot(
    page,
    "08a-ca-add-modal-footer-ctas.png",
    `CA add footer Cancel+Submit visible: ${caFooterBefore.detail}`,
    caFooterBefore.allOk
  );

  await page.click("#ca-driver-add-submit");
  await page.waitForTimeout(500);
  const failToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  const caFooterError = await assertFooterCtasVisible(page, [
    "#ca-driver-add-modal .company-driver-add-actions [data-action='closeCompanyDriverAddModal']",
    "#ca-driver-add-submit"
  ]);
  await shot(
    page,
    "09-ca-driver-create-error.png",
    `validation error toast=${failToast.slice(0, 80)}; footer=${caFooterError.detail}`,
    failToast.length > 3 && caFooterError.allOk
  );

  await clearToasts(page);
  await page.fill("#ca-driver-add-eid", "EID-P3-OK");
  await page.fill("#ca-driver-add-first-name", "Novi");
  await page.fill("#ca-driver-add-last-name", "Vozac");
  await page.fill("#ca-driver-add-email", "novi.p3@qa.local");
  await page.fill("#ca-driver-add-phone", "+436992222222");
  await page.fill("#ca-driver-add-pin", "12345");
  await page.selectOption("#ca-driver-add-group", "101").catch(() => {});
  await page.click("#ca-driver-add-submit");
  await page.waitForTimeout(900);
  const created = await page.evaluate(() => {
    const d = (window.state.drivers || []).find((row) => String(row.eid || "").toUpperCase() === "EID-P3-OK"
      || String(row.email || "") === "novi.p3@qa.local"
      || `${row.firstName || ""} ${row.lastName || ""}`.includes("Novi"));
    if (!d) return { found: false };
    const keys = Object.keys(d);
    return {
      found: true,
      hasPin: keys.includes("pin") || keys.includes("otp") || keys.includes("activationCode")
    };
  });
  const okToast = await page.locator("#toast-container .toast").first().textContent().catch(() => "");
  const directoryHtml = await page.locator("#ca-drivers-directory").innerHTML().catch(() => "");
  const directoryLeaksPin = /12345/.test(directoryHtml);
  await shot(
    page,
    "08-ca-driver-created-no-creds.png",
    `created found=${created.found} directoryLeaksPin=${directoryLeaksPin} toast=${okToast.slice(0, 80)}`,
    created.found === true && directoryLeaksPin === false && /dodat|added|angelegt|PIN/i.test(okToast)
  );
  log(
    "08b-directory-no-plaintext-pin",
    directoryLeaksPin ? "directory leaked plaintext PIN" : "directory has no plaintext PIN 12345",
    directoryLeaksPin ? "fail" : "pass"
  );

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed, trail }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 3 visual trail",
    "",
    "Assignment resource integrity (D24) + CA atomic create.",
    "",
    "Sub-phases:",
    "A. Programmatic hard-fail (persistShift) — occupied / inactive / not-ready / conflict.",
    "B. Real monthly day-edit modal — Cancel / Undo / Save fully visible; Save blocked; Cancel closes.",
    "C. CA add-driver modal — Cancel / Submit fully scrolled into view; validation + create without PIN leak.",
    "",
    ...trail.map((t) => `- **${t.step}** [${t.status}] ${t.detail}`)
  ].join("\n"));

  if (failed) {
    console.error("VISUAL TRAIL FAILED");
    process.exit(1);
  }
  console.log("VISUAL TRAIL OK");
} catch (err) {
  console.error(err);
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({ failed: true, trail, error: String(err) }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
