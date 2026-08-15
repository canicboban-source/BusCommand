/**
 * FAZA 3 D24.2.1-A.1 visual trail — honest UI evidence only.
 *
 * Rules:
 * - No page.evaluate-crafted toasts/modals as outcome proof.
 * - Real file-input + Confirm CTA paths.
 * - Relevant elements must be inside the viewport (bounding box).
 * - Fail on raw i18n keys.
 *
 * Shots:
 * 1) New CSV format (preview row, no company_code)
 * 2) Legacy company_code ignored notice (in frame, no secret)
 * 3) Duplicate EID rejected via real CSV parse toast
 * 4) maxDrivers via Confirm import → real promptDriverLimitUpgrade confirm modal
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createEphemeralQaState } from "../tests/e2e/qa-factory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(root, "reports", `phase-3-d2421-visual-${stamp}`);
const PORT = process.env.PORT || "8768";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(root, "reports", "phase-3-d2421-visual-latest.txt"), outDir);

const trail = [];
let failed = false;
function log(step, detail, status = "pass", screenshot = null) {
  trail.push({ step, detail, status, screenshot, at: new Date().toISOString() });
  console.log(`[${status}] ${step}: ${detail}`);
  if (status === "fail") failed = true;
}

function looksLikeRawI18nKey(text) {
  const s = String(text || "").trim();
  if (!s) return true;
  // bare key or key-like token without spaces of localized words
  if (/^[a-z][a-z0-9_]{6,}$/i.test(s) && s.includes("_")) return true;
  if (/\bca_drivers_[a-z0-9_]+\b/i.test(s)) return true;
  if (/\blicense_upgrade_[a-z0-9_]+\b/i.test(s)) return true;
  return false;
}

async function isFullyInViewport(locator) {
  const handle = await locator.elementHandle();
  if (!handle) return { ok: false, reason: "missing" };
  const box = await handle.boundingBox();
  if (!box) return { ok: false, reason: "no-box" };
  const vp = await locator.page().viewportSize();
  if (!vp) return { ok: false, reason: "no-viewport" };
  const pad = 1;
  const ok =
    box.x >= -pad
    && box.y >= -pad
    && box.x + box.width <= vp.width + pad
    && box.y + box.height <= vp.height + pad
    && box.width > 8
    && box.height > 8;
  return {
    ok,
    reason: ok ? "in-viewport" : `oob x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} w=${box.width.toFixed(0)} h=${box.height.toFixed(0)} vp=${vp.width}x${vp.height}`,
    box
  };
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

/** Cleanup only — never used to invent outcome UI. */
async function clearToasts(page) {
  await page.evaluate(() => {
    const el = document.getElementById("toast-container");
    if (el) el.replaceChildren();
  });
}

const SECRET_CODE = "SECRET-LEGACY-NEVER-SHOW";
const SECRET_EID = "SECRET-EID-NEVER-SHOW";

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
// Exactly one driver so maxDrivers=1 blocks a 2-row import.
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
    hasPersonalCode: true
  }
];
fixture.state.maxDrivers = 1;
fixture.state.licenseType = "starter";
fixture.state.packageLabel = "STARTER";
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
  const caEmail = page.locator("#login-company-email, #login-admin-email, #login-dispatcher-email").first();
  const caPass = page.locator("#login-company-password, #login-admin-password, #login-dispatcher-password").first();
  await caEmail.fill("ca@qa.local");
  await caPass.fill("Qa-test-ok-9");
  await page.locator("#company-login-btn, #admin-login-btn, #dispatcher-login-btn").first().click();
  await page.waitForTimeout(900);

  // Navigate via real shell API (not outcome toast crafting).
  await page.evaluate(() => {
    if (typeof window.changeLanguage === "function") window.changeLanguage("sr");
    if (typeof window.switchSection === "function") window.switchSection("company-admin-drivers");
  });
  await page.waitForTimeout(700);
  await page.locator("#company-admin-drivers").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("#ca-drivers-import-group").selectOption("101");

  // Fixture for wouldExceedDriverLimit (reads window._licenseInfo, not state.maxDrivers).
  // This is setup, not outcome proof.
  await page.evaluate(() => {
    window._licenseInfo = {
      ...(window._licenseInfo || {}),
      companyId: "qa-local",
      status: "active",
      licenseStatus: "active",
      licenseType: "starter",
      packageLabel: "STARTER",
      maxDrivers: 1,
      daysRemaining: 31
    };
  });

  // ── 1) Official new CSV via real file input ─────────────────────────────
  await page.locator("#ca-drivers-import-file").setInputFiles({
    name: "drivers-new-format.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "eid,first_name,last_name,phone,email\nEID-NEW-FMT,Ana,Nova,+43664000001,ana-new@qa.local\n"
    )
  });
  const preview = page.locator("#ca-drivers-import-preview");
  await preview.waitFor({ state: "visible", timeout: 8000 });
  await preview.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const row1 = preview.locator("tbody tr").first();
  await row1.waitFor({ state: "visible" });
  await row1.scrollIntoViewIfNeeded();
  const previewVp = await isFullyInViewport(preview);
  const rowVp = await isFullyInViewport(row1);
  const previewText = await preview.innerText();
  const theadText = await preview.locator("thead").innerText().catch(() => "");
  const shot1Ok =
    previewVp.ok
    && rowVp.ok
    && (await preview.locator("tbody tr").count()) === 1
    && /EID-NEW-FMT/i.test(previewText)
    && /Ana/i.test(previewText)
    && !/company_code/i.test(theadText)
    && !previewText.includes(SECRET_CODE)
    && !looksLikeRawI18nKey(previewText);
  await shot(
    page,
    "01-new-csv-format-no-company-code.png",
    `previewVp=${previewVp.reason}; rowVp=${rowVp.reason}; hasEid=${/EID-NEW-FMT/i.test(previewText)}`,
    shot1Ok
  );

  // ── 2) Legacy company_code column → notice in viewport, secret never shown ─
  await page.locator("#ca-drivers-import-file").setInputFiles({
    name: "drivers-legacy.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "eid,first_name,last_name,phone,email,company_code",
      `EID-LEGACY,Legacy,Driver,+43664000002,legacy@qa.local,${SECRET_CODE}`
    ].join("\n"))
  });
  await preview.waitFor({ state: "visible", timeout: 8000 });
  const notice = page.locator(".company-drivers-legacy-notice");
  await notice.waitFor({ state: "visible", timeout: 8000 });
  await notice.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const noticeVp = await isFullyInViewport(notice);
  const noticeText = await notice.innerText();
  const preview2Text = await preview.innerText();
  const shot2Ok =
    noticeVp.ok
    && noticeText.length > 20
    && !looksLikeRawI18nKey(noticeText)
    && !noticeText.includes(SECRET_CODE)
    && !preview2Text.includes(SECRET_CODE)
    && /company_code|SMS|OTP|PIN|ignor/i.test(noticeText);
  await shot(
    page,
    "02-legacy-company-code-ignored-notice.png",
    `noticeVp=${noticeVp.reason}; leaked=${preview2Text.includes(SECRET_CODE)}; len=${noticeText.length}`,
    shot2Ok
  );

  // ── 3) Duplicate EID via real CSV parse (file input → toast from handler) ─
  await clearToasts(page);
  await page.locator("#ca-drivers-import-file").setInputFiles({
    name: "drivers-dup-eid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "eid,first_name,last_name,phone,email",
      `${SECRET_EID},Dup,One,+43664000003,dup1@qa.local`,
      `${SECRET_EID},Dup,Two,+43664000004,dup2@qa.local`
    ].join("\n"))
  });
  const toast = page.locator("#toast-container .toast").filter({ hasText: /duplikat|duplicate|doppel/i }).first();
  await toast.waitFor({ state: "visible", timeout: 8000 });
  await toast.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const toastVp = await isFullyInViewport(toast);
  const toastText = await toast.innerText();
  const shot3Ok =
    toastVp.ok
    && toastText.length > 8
    && !looksLikeRawI18nKey(toastText)
    && !toastText.includes(SECRET_EID)
    && !toastText.includes(SECRET_CODE)
    && /duplikat|duplicate|doppel/i.test(toastText);
  await shot(
    page,
    "03-duplicate-eid-conflict.png",
    `toastVp=${toastVp.reason}; leaked=${toastText.includes(SECRET_EID)}; text=${toastText.slice(0, 60)}`,
    shot3Ok
  );

  // ── 4) maxDrivers: real Confirm import → promptDriverLimitUpgrade modal ──
  // Re-seed a valid 2-row import that exceeds maxDrivers=1 (1 existing + 2 incoming).
  await page.locator("#ca-drivers-import-file").setInputFiles({
    name: "drivers-over-limit.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "eid,first_name,last_name,phone,email",
      "EID-LIM-A,Limit,Alpha,+43664000011,lim-a@qa.local",
      "EID-LIM-B,Limit,Beta,+43664000012,lim-b@qa.local"
    ].join("\n"))
  });
  await preview.waitFor({ state: "visible", timeout: 8000 });
  await preview.scrollIntoViewIfNeeded();
  const confirmBtn = preview.locator(".company-drivers-import-button");
  await confirmBtn.waitFor({ state: "visible" });
  await confirmBtn.scrollIntoViewIfNeeded();
  await confirmBtn.click();

  const modal = page.locator("#global-confirm-modal");
  await modal.waitFor({ state: "visible", timeout: 8000 });
  // Ensure not display:none / hidden class
  await page.waitForFunction(() => {
    const m = document.getElementById("global-confirm-modal");
    if (!m) return false;
    const style = window.getComputedStyle(m);
    return !m.classList.contains("hidden") && style.display !== "none" && style.visibility !== "hidden";
  }, null, { timeout: 8000 });
  await modal.scrollIntoViewIfNeeded();
  const msgEl = page.locator("#global-confirm-message");
  const yesBtn = page.locator("#global-confirm-yes");
  const noBtn = page.locator("#global-confirm-modal [data-action='closeConfirmModal'], #global-confirm-no, #global-confirm-modal .btn-secondary, #global-confirm-modal button").filter({ hasText: /ne|no|abbrechen|cancel|otkaž|odust/i }).first();
  await msgEl.waitFor({ state: "visible" });
  await yesBtn.waitFor({ state: "visible" });
  await msgEl.scrollIntoViewIfNeeded();
  const modalVp = await isFullyInViewport(modal);
  const msgVp = await isFullyInViewport(msgEl);
  const msgText = await msgEl.innerText();
  const yesText = await yesBtn.innerText();
  // Prefer a cancel/no control; fall back to any second actionable button in modal.
  let actionsOk = false;
  let actionNote = "";
  if (await noBtn.count()) {
    actionsOk = await noBtn.isVisible();
    actionNote = `noBtn=${actionsOk}`;
  } else {
    const buttons = page.locator("#global-confirm-modal button");
    const btnCount = await buttons.count();
    actionsOk = btnCount >= 2 && await yesBtn.isVisible();
    actionNote = `buttons=${btnCount}`;
  }
  const shot4Ok =
    modalVp.ok
    && msgVp.ok
    && actionsOk
    && await yesBtn.isVisible()
    && msgText.length > 10
    && !looksLikeRawI18nKey(msgText)
    && !looksLikeRawI18nKey(yesText)
    && /1/.test(msgText)
    && /(STARTER|starter|vozač|fahrer|driver|paket|package|upgrade|nadograd)/i.test(msgText)
    && !msgText.includes(SECRET_CODE)
    && !msgText.includes(SECRET_EID);
  await shot(
    page,
    "04-maxdrivers-block.png",
    `modalVp=${modalVp.reason}; msgVp=${msgVp.reason}; ${actionNote}; msg=${msgText.slice(0, 80)}`,
    shot4Ok
  );

  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.2.1-A.1",
    folder: outDir,
    note: "Honest UI evidence: real file-input / Confirm CTA. Viewport + no raw i18n keys required. Not Rules/tx/authz proof.",
    failed,
    trail
  }, null, 2));
  writeFileSync(join(outDir, "README.md"), [
    "# FAZA 3 D24.2.1-A.1 visual trail (evidence correction)",
    "",
    "Screenshots are UI-only. They do **not** prove Firestore transactions, Rules deny,",
    "bcrypt absence in tx, or parallel uniqueness.",
    "",
    "Gate rules: real user path, element in viewport, no raw i18n keys, no crafted toasts.",
    "",
    `Folder: \`${outDir}\``,
    "",
    ...trail.map((t) => `- **${t.step}** [${t.status}] ${t.detail}`)
  ].join("\n"));

  if (failed) {
    console.error("D24.2.1-A.1 VISUAL FAILED");
    process.exit(1);
  }
  console.log("D24.2.1-A.1 VISUAL OK");
  console.log("OUT_DIR=" + outDir);
} catch (err) {
  console.error(err);
  writeFileSync(join(outDir, "TRAIL.json"), JSON.stringify({
    phase: "D24.2.1-A.1", failed: true, trail, error: String(err?.stack || err)
  }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
