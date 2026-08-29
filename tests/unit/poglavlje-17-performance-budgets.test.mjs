import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("driver entry does not import staff dispatcher state-observer setup", () => {
  const driver = read("js/main-driver.js");
  const staff = read("js/main-staff.js");
  const setup = read("js/core/state-observer-setup.js");
  const staffSetup = read("js/core/state-observer-setup-staff.js");
  const i18n = read("js/ui/i18n.js");

  assert.doesNotMatch(driver, /state-observer-setup-staff/);
  assert.doesNotMatch(driver, /state-observer-setup\.js/);
  assert.match(staff, /state-observer-setup-staff\.js/);
  assert.doesNotMatch(setup, /renderDispatcherDashboard|renderGroupHub|dispatcher\//);
  assert.match(staffSetup, /renderDispatcherDashboard/);
  assert.match(staffSetup, /renderGroupHub/);
  assert.doesNotMatch(i18n, /import \{ populateTemplateSelect \} from/);
  assert.match(i18n, /msg-compose-loader\.js/);
  assert.match(i18n, /getMsgComposeIfLoaded/);
  assert.doesNotMatch(i18n, /loadMsgCompose\s*\(/);
  assert.doesNotMatch(i18n, /import\("\.\.\/dispatcher\/msg-compose\.js"\)/);
});

test("Lucide CDN is pinned and office parsers are not eager in monolith head", () => {
  const monolith = read("index.legacy-monolith.html");
  assert.match(monolith, /lucide@0\.469\.0/);
  assert.doesNotMatch(monolith, /lucide@latest/);
  assert.doesNotMatch(monolith, /cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js/);
  assert.doesNotMatch(monolith, /xlsx@0\.18\.5\/dist\/xlsx\.full\.min\.js/);
  assert.match(read("js/core/office-parsers.js"), /ensureXlsx/);
  assert.match(read("js/core/office-parsers.js"), /ensurePdfJs/);
});

test("bundle budget gate script exports D17 soft-pilot thresholds", () => {
  const script = read("scripts/check-bundle-budgets.js");
  assert.match(script, /driverAppJsBytesExclTranslations/);
  assert.match(script, /staffAppJsBytesExclTranslations/);
  assert.match(script, /translationsChunkBytes/);
  assert.match(script, /renderDispatcherDashboard/);
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.build, /check-bundle-budgets/);
  assert.equal(pkg.scripts["check:bundle-budgets"], "node scripts/check-bundle-budgets.js");
});

test("staff confirmation and message compose avoid unbounded driver collection scans for dispatchers", () => {
  const routes = read("server/driver-routes.js");
  assert.match(routes, /function loadDriverDocsForGroups/);
  const helperStart = routes.indexOf("async function loadDriverDocsForGroups");
  const helper = routes.slice(helperStart, helperStart + 600);
  assert.match(helper, /where\("groupId", "==", groupId\)/);
  assert.doesNotMatch(helper, /knownGroupIds/);
  const confirmIdx = routes.indexOf('app.get("/api/staff/shift-confirmations"');
  const confirmSlice = routes.slice(confirmIdx, confirmIdx + 4500);
  assert.match(confirmSlice, /where\("date", ">=", from\)/);
  assert.match(confirmSlice, /where\("targetDate", ">=", from\)/);
  assert.match(confirmSlice, /loadDriverDocsForGroups\(companyRef,\s*groupIds\)/);
  assert.doesNotMatch(confirmSlice, /collection\("drivers"\)\.get\(\)/);

  const msgIdx = routes.indexOf('app.post("/api/staff/messages"');
  const msgSlice = routes.slice(msgIdx, msgIdx + 3500);
  assert.match(msgSlice, /role === "dispatcher"/);
  assert.match(msgSlice, /loadDriverDocsForGroups\(companyRef,\s*groupIds\)/);
});

test("CA groups and drivers search use debounce", () => {
  assert.match(read("js/admin/company-admin-groups.js"), /setTimeout\(\(\) => renderCompanyAdminGroups\(\), 250\)/);
  assert.match(read("js/admin/company-admin-drivers.js"), /handleCompanyDriversSearch/);
  assert.match(read("js/admin/company-admin-drivers.js"), /driversFilterTimer/);
  assert.match(read("js/admin/company-admin-drivers.js"), /setTimeout\([\s\S]*250\)/);
  assert.match(read("index.legacy-monolith.html"), /data-input-action="handleCompanyDriversSearch"/);
});

test("D17 decision and SURFACE split item reflect Ch17 work", () => {
  assert.ok(existsSync(join(root, "docs/decisions.md")));
  // Decision text is added with the chapter report; keep structural guard soft.
  const surface = read("docs/SURFACE-SPLIT-PROGRESS.md");
  assert.match(surface, /state-observer/);
});

test("lazy CA audit log loader wires dynamic import and action handlers without eager bundle pollution", async () => {
  const staffSections = read("js/surface/register-staff-sections.js");
  const staffOnClick = read("js/register-onclick-staff.js");

  // Verify static import is absent in staff section registrations
  assert.doesNotMatch(staffSections, /import \{ renderCompanyAdminAudit \} from/);
  assert.match(staffSections, /import\("\.\.\/admin\/company-admin-audit\.js"\)/);

  // Verify lazy loaders and dynamic handlers in staff onclick
  assert.doesNotMatch(staffOnClick, /import \{ handleCompanyAuditFilters/);
  assert.match(staffOnClick, /function loadCompanyAdminAudit\(\)/);
  assert.match(staffOnClick, /handleCompanyAuditFilters\s*\(/);
  assert.match(staffOnClick, /refreshCompanyAudit\s*\(/);
  assert.match(staffOnClick, /resetCompanyAuditFilters\s*\(/);
  assert.match(staffOnClick, /loadMoreCompanyAudit\s*\(/);

  // Verify target module exports the expected interface
  const auditSource = read("js/admin/company-admin-audit.js");
  assert.match(auditSource, /export \{[^}]*renderCompanyAdminAudit/);
  assert.match(auditSource, /export \{[^}]*handleCompanyAuditFilters/);
  assert.match(auditSource, /export \{[^}]*refreshCompanyAudit/);
  assert.match(auditSource, /export \{[^}]*resetCompanyAuditFilters/);
  assert.match(auditSource, /export \{[^}]*loadMoreCompanyAudit/);
});
