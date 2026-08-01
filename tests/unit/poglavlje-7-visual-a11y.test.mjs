import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { DEFAULT_BRAND_COLOR } from "../../js/admin/company-admin-branding-model.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("canonical brand blue matches design tokens and branding default", async () => {
  const tokens = await read("../../css/design-tokens.css");
  assert.equal(DEFAULT_BRAND_COLOR, "#2563EB");
  assert.match(tokens, /--primary-color:\s*#2563EB/);
  assert.match(tokens, /--shadow-blue:[\s\S]*var\(--primary-rgb\)/);
  assert.match(tokens, /:focus-visible/);
  assert.match(tokens, /prefers-reduced-motion:\s*reduce/);
});

test("confirm modal has dialog semantics and focus trap wiring", async () => {
  const modalJs = await read("../../js/ui/confirm-modal.js");
  const staff = await read("../../staff.html");
  const driver = await read("../../driver.html");
  assert.match(modalJs, /aria-modal/);
  assert.match(modalJs, /Escape/);
  assert.match(modalJs, /_previousFocus/);
  assert.match(modalJs, /Tab/);
  assert.match(staff, /id="global-confirm-modal"[^>]*role="dialog"/);
  assert.match(driver, /id="global-confirm-modal"[^>]*role="dialog"/);
});

test("p7 staff and driver surfaces expose i18n aria labels for icon controls", async () => {
  const staff = await read("../../staff.html");
  const driver = await read("../../driver.html");
  const shell = await read("../../js/layout/shell-staff.js");
  const sa = await read("../../js/auth/superadmin.js");
  assert.match(staff, /data-i18n-aria-label="week_nav_prev"/);
  assert.match(staff, /data-i18n-aria-label="hub_add_bus_aria"/);
  assert.match(driver, /data-i18n-aria-label="driver_profile_aria"/);
  assert.match(shell, /role_superadmin/);
  assert.match(shell, /stealth_inspect_banner/);
  assert.match(sa, /sa_err_enter_credentials/);
  assert.match(sa, /error_invalid_credentials/);
  assert.match(sa, /sa_err_not_superadmin/);
});

test("required p7 keys exist in en, sr and de", async () => {
  const src = await read("../../translations.js");
  // Evaluate only the assigned language objects is heavy; assert key presence in each Object.assign block.
  const keys = [
    "role_superadmin",
    "sa_err_incorrect_pin",
    "sa_err_enter_credentials",
    "sa_err_not_superadmin",
    "week_nav_prev",
    "week_nav_next",
    "driver_profile_aria",
    "stealth_inspect_banner"
  ];
  for (const key of keys) {
    const hits = src.match(new RegExp(`${key}:`, "g")) || [];
    assert.ok(hits.length >= 3, `${key} should exist in at least en/sr/de (found ${hits.length})`);
  }
});
