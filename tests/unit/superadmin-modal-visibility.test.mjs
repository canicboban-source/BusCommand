import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("superadmin auth always uses real staff credentials", () => {
  const src = readFileSync(join(root, "js/auth/superadmin.js"), "utf8");
  assert.match(src, /setSaFieldVisibility\(demoFields,\s*false\)/);
  assert.match(src, /setSaFieldVisibility\(prodFields,\s*true\)/);
  assert.match(src, /tryDemoSuperAdminLogin/);
  assert.doesNotMatch(src, /DEMO_SA_PIN|admin123/);
});

test("demo mode bootstraps platform Super Admin for local login", () => {
  const src = readFileSync(join(root, "js/core/state.js"), "utf8");
  assert.match(src, /function ensureDemoPlatformAdmin/);
  assert.match(src, /sa@demo\.local/);
  assert.match(src, /ensureDemoPlatformAdmin\(window\.state\)/);
});

test("superadmin modal HTML hides both field groups by default", () => {
  const html = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
  assert.match(html, /id="superadmin-demo-fields"[^>]*class="hidden"/);
  assert.match(html, /id="superadmin-prod-fields"[^>]*class="hidden"/);
  assert.match(html, /id="superadmin-demo-fields"[^>]*style="display:none;"/);
  assert.match(html, /id="superadmin-prod-fields"[^>]*style="display:none;"/);
});

test("superadminOpenCompanyDetail shows the company detail modal", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  const openStart = src.indexOf("async function superadminOpenCompanyDetail");
  const openEnd = src.indexOf("function superadminCloseCompanyDetail", openStart);
  assert.ok(openStart > -1 && openEnd > openStart, "open/close handlers missing");
  const openFn = src.slice(openStart, openEnd);
  assert.match(openFn, /modal\.classList\.remove\("hidden"\)/);
  assert.match(openFn, /modal\.style\.display\s*=\s*"flex"/);
  assert.match(openFn, /showDetailModal\(\)/);
  // Must show on demo, success, and error paths (not only fill DOM).
  assert.equal((openFn.match(/showDetailModal\(\)/g) || []).length >= 3, true);
});

test("staff surface includes sa-company-detail-modal markup", () => {
  const html = readFileSync(join(root, "staff.html"), "utf8");
  assert.match(html, /id="sa-company-detail-modal"/);
  assert.match(html, /data-action="superadminCloseCompanyDetail"/);
});

test("demo Super Admin dashboard aligns with company table headers", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  const start = src.indexOf("function _renderSuperAdminDashboardDemo");
  const end = src.indexOf("async function superadminToggleStatus", start);
  assert.ok(start > -1 && end > start, "demo dashboard renderer missing");
  const fn = src.slice(start, end);
  assert.match(fn, /superadmin-total-dispatchers/);
  assert.doesNotMatch(fn, /superadmin-total-groups/);
  assert.match(fn, /sa-company-id-cell/);
  assert.match(fn, /superadminOpenCompanyDetail/);
  assert.match(fn, /superadminToggleStatus/);
  assert.match(fn, /superadminStartSupport/);
  assert.match(fn, /escapeHtml\(c\.name/);
  assert.match(fn, /_demoCompanyStatus/);
  assert.match(fn, /_demoCompanyPlan/);
});

test("demo company detail hydrates from dispatcher state", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  const openStart = src.indexOf("async function superadminOpenCompanyDetail");
  const openEnd = src.indexOf("function superadminCloseCompanyDetail", openStart);
  const openFn = src.slice(openStart, openEnd);
  assert.match(openFn, /window\.state\.dispatchers/);
  assert.match(openFn, /window\.state\.companyAdmins/);
  assert.match(openFn, /_demoCompanyStatus/);
});

test("demo Super Admin delete and support have local branches", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  assert.match(src, /function _findDemoCompanyDispatcher/);
  assert.match(src, /async function superadminConfirmDeleteCompany[\s\S]*IS_DEMO_MODE/);
  assert.match(src, /async function superadminConfirmSupportStart[\s\S]*IS_DEMO_MODE/);
  assert.match(src, /async function superadminEndSupport[\s\S]*IS_DEMO_MODE/);
});
