import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadTranslations() {
  const src = readFileSync(join(root, "translations.js"), "utf8");
  const sandbox = { window: {} };
  runInContext(src, createContext(sandbox));
  return sandbox.window.TRANSLATIONS;
}

const CH16_KEYS = [
  "sa_status_updated",
  "sa_pin_length_error",
  "sa_ca_email_exists",
  "sa_ca_created_for_company",
  "sa_ca_deleted",
  "sa_company_deleted",
  "sos_alarm_received",
  "avatar_image_type_error",
  "dispatcher_select_group",
  "license_suspended_banner",
  "nav_sos",
];

test("Ch16 i18n keys exist in en/sr/de with real copy", () => {
  const T = loadTranslations();
  for (const lang of ["en", "sr", "de"]) {
    for (const key of CH16_KEYS) {
      assert.ok(T[lang][key], `${lang}.${key} missing`);
      assert.notEqual(T[lang][key], key);
      assert.ok(String(T[lang][key]).trim().length > 0);
    }
  }
});

test("SA toast paths use i18n keys instead of hardcoded EN status strings", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  // sa_pin_length_error / sa_ca_email_exists / sa_ca_created_for_company moved to the
  // lazy-loaded create-company-flow chunk as part of the B2C-01-F1 split.
  const flowSrc = readFileSync(join(root, "js/admin/sa-create-company-flow.js"), "utf8");
  assert.match(src, /t\("sa_status_updated"\)/);
  assert.match(flowSrc, /t\("sa_pin_length_error"\)/);
  assert.match(flowSrc, /t\("sa_ca_email_exists"\)/);
  assert.match(flowSrc, /t\("sa_ca_created_for_company"/);
  assert.match(src, /t\("sa_ca_deleted"\)/);
  assert.match(src, /t\("sa_company_deleted"\)/);
  assert.doesNotMatch(src, /showToast\(\s*["']Status updated/);
  assert.doesNotMatch(src, /showToast\(\s*["']PIN must be/);
  assert.doesNotMatch(flowSrc, /showToast\(\s*["']PIN must be/);
});

test("SOS modals expose dialog semantics on staff/driver/monolith", () => {
  for (const file of ["staff.html", "driver.html", "index.legacy-monolith.html"]) {
    const html = readFileSync(join(root, file), "utf8");
    assert.match(html, /id="sos-confirm-modal"[^>]*role="dialog"/);
    assert.match(html, /id="sos-confirm-modal"[^>]*aria-modal="true"/);
    assert.match(html, /id="sos-confirm-title"/);
  }
  // D26: the driver-side "are you sure?" SOS modal is gone. The anti-panic control
  // is a 2s hold on the SOS button; releasing early aborts (WCAG 2.5.2 up-reversal).
  const driver = readFileSync(join(root, "driver.html"), "utf8");
  assert.doesNotMatch(driver, /id="sos-trigger-modal"/);
  assert.match(driver, /id="mobnav-sos"[^>]*data-sos-hold="true"/);
  assert.match(driver, /id="mobnav-sos"[^>]*data-sos-hold-ms="2000"/);
  assert.match(driver, /id="mobnav-sos"[^>]*data-i18n-aria-label="sos_hold_aria"/);
  assert.match(driver, /data-i18n="nav_sos"/);

  const monolith = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
  assert.doesNotMatch(monolith, /id="sos-trigger-modal"/);
  assert.match(monolith, /id="clear-sos-modal"[^>]*role="dialog"/);
  assert.match(monolith, /data-i18n="nav_sos"/);
});

test("shared focus trap module is wired into every module that owns a modal", () => {
  const trap = readFileSync(join(root, "js/ui/focus-trap.js"), "utf8");
  assert.match(trap, /function attachFocusTrap/);
  assert.match(trap, /event\.key === "Escape"/);
  assert.match(trap, /event\.key !== "Tab"/);

  // D26: js/driver/dashboard.js dropped off this list because its only modal
  // (the SOS "are you sure?" dialog) was replaced by the 2s hold control.
  for (const file of [
    "js/ui/modals.js",
    "js/ui/confirm-modal.js",
  ]) {
    const src = readFileSync(join(root, file), "utf8");
    assert.match(src, /attachFocusTrap/);
    assert.match(src, /focus-trap\.js/);
  }
  const driverDashboard = readFileSync(join(root, "js/driver/dashboard.js"), "utf8");
  assert.doesNotMatch(driverDashboard, /attachFocusTrap/);
});

test("ops status rails use design tokens not raw status hex", () => {
  const css = readFileSync(join(root, "css/staff-desktop.css"), "utf8");
  assert.match(css, /\.ops-daily-table tr\.is-uncovered[\s\S]*?var\(--danger-color\)/);
  assert.match(css, /\.ops-daily-table tr\.is-pending[\s\S]*?var\(--warning-color\)/);
  assert.match(css, /\.ops-daily-table tr\.is-ok[\s\S]*?var\(--success-color\)/);
  assert.match(css, /\.ops-action-card\.is-critical \.ops-action-rail[\s\S]*?var\(--danger-color\)/);
  assert.doesNotMatch(
    css,
    /#dispatcher-dashboard \.ops-action-card\.is-critical \.ops-action-rail\s*\{\s*background:\s*#F87171/
  );
});
