/**
 * B2C-01-F1.1.1.1 — Close no-load, loader toast lifecycle, no prod test hooks.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import {
  createSaCreateCompanyFlowLoader,
  importSaCreateCompanyFlowModule,
  isTrustedSaCreateFlowPathname
} from "../../js/admin/sa-create-company-flow-loader.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("F1.1.1.1 Close does not load module when unloaded", () => {
  const sa = read("js/admin/superadmin.js");
  assert.match(sa, /function superadminCloseCreateModal/);
  assert.match(sa, /dismissSaCreateModalShellLocal/);
  assert.doesNotMatch(
    sa,
    /withSaCreateFlowModule\(\(mod\) => mod\.superadminCloseCreateModal/
  );
  assert.match(sa, /getSaCreateFlowIfLoaded\(\)/);
});

test("F1.1.1.1 loader toast has dedicated ownership and success clears it", () => {
  const sa = read("js/admin/superadmin.js");
  assert.match(sa, /showSaCreateLoaderFailureToast/);
  assert.match(sa, /dismissSaCreateLoaderFailureToast/);
  assert.match(sa, /data-sa-create-loader-toast/);
  assert.match(sa, /Successful load clears any prior loader-failure toast/);
  assert.match(sa, /error_generic/);
  // Loader toast marker is distinct from flow outcome marker.
  assert.match(sa, /data-sa-create-loader-toast/);
  const flow = read("js/admin/sa-create-company-flow.js");
  assert.match(flow, /data-sa-create-outcome/);
});

test("F1.1.1.1 no window.USE_LOCAL_STATE override and no ForTests production exports", () => {
  const sa = read("js/admin/superadmin.js");
  const flow = read("js/admin/sa-create-company-flow.js");
  const loader = read("js/admin/sa-create-company-flow-loader.js");
  assert.doesNotMatch(sa, /window\.USE_LOCAL_STATE/);
  assert.doesNotMatch(flow, /window\.USE_LOCAL_STATE/);
  assert.doesNotMatch(loader, /__setSaCreateFlowLoaderForTests/);
  assert.doesNotMatch(loader, /__resetSaCreateFlowLoaderForTests/);
  assert.doesNotMatch(flow, /__getSaCreateFlowForTests/);
  assert.doesNotMatch(flow, /__resetSaCreateFlowForTests/);
  assert.doesNotMatch(sa, /__getSaCreateFlowForTests/);
  assert.doesNotMatch(sa, /__resetSaCreateFlowForTests/);
  assert.doesNotMatch(flow, /window\.__b2c01f1/);
  assert.doesNotMatch(sa, /window\.__b2c01f1/);
  assert.match(loader, /createSaCreateCompanyFlowLoader/);
});

test("F1.1.1.1 E2E/visual avoid production test hooks", () => {
  const e2e = read("tests/e2e/b2c01-f1-create-company-ca.spec.js");
  const vis = read("tests/e2e/b2c01-f1-visual-trail.spec.js");
  for (const src of [e2e, vis]) {
    assert.doesNotMatch(src, /window\.USE_LOCAL_STATE\s*=\s*(?:true|false)/);
    assert.doesNotMatch(src, /__getSaCreateFlowForTests/);
    assert.doesNotMatch(src, /__resetSaCreateFlowForTests/);
    assert.doesNotMatch(src, /__setSaCreateFlowLoaderForTests/);
    assert.doesNotMatch(src, /window\.__b2c01f1\s*=/);
  }
  assert.match(e2e, /installFirebaseSaStubRoutes/);
  assert.match(vis, /01-load-failure-one-toast\.png/);
  assert.match(vis, /04-ca-success-in-table\.png/);
});

test("F1.1.1.1 pure loader factory: reject clears cache; parallel share", async () => {
  let attempts = 0;
  let gateResolve;
  const gate = new Promise((r) => { gateResolve = r; });
  const loader = createSaCreateCompanyFlowLoader(async () => {
    attempts += 1;
    await gate;
    return { ok: true };
  });
  const p1 = loader.load();
  const p2 = loader.load();
  assert.equal(p1, p2);
  gateResolve();
  await p1;
  assert.equal(attempts, 1);

  let fails = 0;
  const bad = createSaCreateCompanyFlowLoader(async () => {
    fails += 1;
    throw new Error("boom");
  });
  await assert.rejects(() => bad.load());
  assert.equal(fails, 1);
  assert.equal(bad.getIfLoaded(), null);
  // Second explicit load retries (cache cleared).
  await assert.rejects(() => bad.load());
  assert.equal(fails, 2);
});

test("F1.1.1.1 importSaCreateCompanyFlowModule recovery is injectable (pure)", async () => {
  let recoveryUrl = null;
  const mod = await importSaCreateCompanyFlowModule({
    nativeImport: async () => {
      throw new Error("Failed to fetch dynamically imported module: http://127.0.0.1:9/assets/sa-create-company-flow-AbC.js");
    },
    recoveryImport: async (url) => {
      recoveryUrl = url;
      return { recovered: true };
    },
    getPerformanceEntries: () => [],
    getPageOrigin: () => "http://127.0.0.1:9",
    now: () => 42
  });
  assert.equal(mod.recovered, true);
  assert.equal(recoveryUrl, "http://127.0.0.1:9/assets/sa-create-company-flow-AbC.js?bc_recovery=42");
  assert.equal(isTrustedSaCreateFlowPathname("/assets/sa-create-company-flow-AbC.js"), true);
});
