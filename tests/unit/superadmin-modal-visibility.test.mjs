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
  assert.match(src, /tryLocalQaSuperAdminLogin/);
  assert.doesNotMatch(src, /DEMO_SA_PIN|admin123/);
  assert.doesNotMatch(src, /tryDemoSuperAdminLogin/);
});

test("product state never auto-seeds platform Super Admin credentials", () => {
  const src = readFileSync(join(root, "js/core/state.js"), "utf8");
  assert.doesNotMatch(src, /ensureDemoPlatformAdmin/);
  assert.doesNotMatch(src, /sa@demo\.local/);
  assert.doesNotMatch(src, /sa-demo-ok/);
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
  assert.match(fn, /_saCompanyRowHtml/);
  assert.match(fn, /_demoCompanyStatus/);
  assert.match(fn, /_demoCompanyPlan/);
  const rowStart = src.indexOf("function _saCompanyRowHtml");
  const rowEnd = src.indexOf("function superadminOpenCreateModal", rowStart);
  assert.ok(rowStart > -1 && rowEnd > rowStart, "company row helper missing");
  const rowFn = src.slice(rowStart, rowEnd);
  assert.match(rowFn, /sa-company-row/);
  assert.match(rowFn, /superadminOpenCompanyDetail/);
  assert.match(rowFn, /superadminToggleStatus/);
  assert.match(rowFn, /superadminStartSupport|sa_support_start/);
  assert.match(rowFn, /rowActionsMenuHtml/);
  assert.match(rowFn, /escapeHtml\(/);
});

test("demo company detail hydrates from dispatcher state", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  const openStart = src.indexOf("async function superadminOpenCompanyDetail");
  const openEnd = src.indexOf("function superadminCloseCompanyDetail", openStart);
  const openFn = src.slice(openStart, openEnd);
  assert.match(openFn, /_findDemoCompanyDispatcher/);
  assert.match(openFn, /window\.state\.companyAdmins/);
  assert.match(openFn, /_demoCompanyStatus/);
  assert.match(src, /function _findDemoCompanyDispatcher[\s\S]*?window\.state\.dispatchers/);
});

test("demo Super Admin delete and support have local branches", () => {
  const src = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  assert.match(src, /function _findDemoCompanyDispatcher/);
  assert.match(src, /async function superadminConfirmDeleteCompany[\s\S]*USE_LOCAL_STATE/);
  assert.match(src, /async function superadminConfirmSupportStart[\s\S]*USE_LOCAL_STATE/);
  assert.match(src, /async function superadminEndSupport[\s\S]*USE_LOCAL_STATE/);
});
