import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLazyModuleLoader } from "../../js/dispatcher/plan-import-loader.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("anonymous Staff install does not statically import CA or Dispatcher role modules", () => {
  const install = read("js/install-staff.js");
  const main = read("js/main-staff.js");
  const onclick = read("js/register-onclick-staff.js");

  assert.doesNotMatch(install, /company-admin\.js/);
  assert.doesNotMatch(install, /dispatcher\/dashboard/);
  assert.doesNotMatch(install, /register-staff-sections/);
  assert.doesNotMatch(install, /register-company-admin-sections/);
  assert.doesNotMatch(install, /register-dispatcher-sections/);
  assert.doesNotMatch(main, /operations-health-consistency/);
  assert.doesNotMatch(onclick, /company-admin-drivers/);
  assert.doesNotMatch(onclick, /dispatcher\/dashboard/);
  assert.match(install, /login-dispatcher/);
  assert.match(main, /ensureStaffRoleGraph|install-staff|register-onclick-staff/);
});

test("ensureStaffRoleGraph source uses createLazyModuleLoader and role dynamic imports", () => {
  const src = read("js/staff/ensure-staff-role-graph.js");
  assert.match(src, /createLazyModuleLoader/);
  assert.match(src, /import\("\.\/install-company-admin-role\.js"\)/);
  assert.match(src, /import\("\.\/install-dispatcher-role\.js"\)/);
  assert.doesNotMatch(src, /import\("\.\.\/admin\/superadmin\.js"\)/);
});

test("role installers are idempotent and concurrent loads share one Promise", async () => {
  let installs = 0;
  const loader = createLazyModuleLoader(async () => {
    installs += 1;
    let installed = false;
    return {
      isInstalled: () => installed,
      install() {
        if (installed) return;
        installed = true;
        installs += 10; // mark install body
      }
    };
  });

  const [a, b] = await Promise.all([loader.load(), loader.load()]);
  assert.equal(a, b);
  assert.equal(installs, 1);
  a.install();
  a.install();
  b.install();
  assert.equal(installs, 11);
  assert.equal(a.isInstalled(), true);

  // Failed load clears cache so a later attempt can retry.
  let failOnce = true;
  const failing = createLazyModuleLoader(async () => {
    if (failOnce) {
      failOnce = false;
      throw new Error("role-chunk-boom");
    }
    return { install() {}, isInstalled: () => true };
  });
  await assert.rejects(() => failing.load(), /role-chunk-boom/);
  const recovered = await failing.load();
  assert.equal(typeof recovered.install, "function");
});

test("CA role graph does not statically import Dispatcher dashboard implementation", () => {
  const ca = read("js/staff/install-company-admin-role.js");
  const caSections = read("js/surface/register-company-admin-sections.js");
  assert.doesNotMatch(ca, /from ["'].*dispatcher\/dashboard/);
  assert.doesNotMatch(ca, /from ["'].*live-map-core/);
  assert.doesNotMatch(caSections, /from ["'].*renderDispatcherDashboard|from ["'].*dispatcher\/dashboard/);
  assert.match(caSections, /renderCompanyAdminDashboard/);
  // CA may lazy-import Dispo sections for read-only ops view.
  assert.match(caSections, /import\("\.\.\/dispatcher\/group-hub\.js"\)/);
});

test("Dispatcher role graph does not import Company Admin dashboard implementation", () => {
  const dispo = read("js/staff/install-dispatcher-role.js");
  const dispoSections = read("js/surface/register-dispatcher-sections.js");
  assert.doesNotMatch(dispo, /company-admin\.js/);
  assert.doesNotMatch(dispoSections, /renderCompanyAdminDashboard/);
  assert.match(dispoSections, /renderDispatcherDashboard/);
});

test("auth boot awaits ensureStaffRoleGraph before initFirebase", () => {
  const login = read("js/auth/login-dispatcher.js");
  const init = read("js/bootstrap/init.js");
  const shell = read("js/layout/shell-staff.js");

  assert.match(login, /await ensureStaffRoleGraph\(window\.currentUser\.role\);\s*\r?\n\s*await initFirebase/);
  assert.match(
    init,
    /await ensureStaffRoleGraphIfNeeded\(authUser\.role\);\s*\r?\n\s*await initFirebase/
  );
  assert.match(init, /import\("\.\.\/staff\/ensure-staff-role-graph\.js"\)/);
  assert.match(shell, /await ensureStaffRoleGraph\(role\)/);
});

test("ensureStaffRoleGraph resolves roles fail-closed", async () => {
  const modUrl = pathToFileURL(path.join(root, "js/staff/ensure-staff-role-graph.js")).href;
  const mod = await import(`${modUrl}?t=${Date.now()}`);
  assert.equal(mod.resolveStaffRoleGraphKey("company_admin"), "company-admin");
  assert.equal(mod.resolveStaffRoleGraphKey("dispatcher"), "dispatcher");
  assert.equal(mod.resolveStaffRoleGraphKey("superadmin"), "superadmin");
  assert.equal(mod.resolveStaffRoleGraphKey("driver"), null);
  await assert.rejects(() => mod.ensureStaffRoleGraph("driver"), /STAFF_ROLE_GRAPH_UNSUPPORTED/);
});
