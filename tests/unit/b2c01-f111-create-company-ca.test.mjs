/**
 * B2C-01-F1.1.1 — scoped outcome cleanup + honest real-UI evidence contracts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("F1.1.1 showToast returns a DOM handle (no global toast API expansion beyond return)", () => {
  const utils = read("js/core/utils.js");
  assert.match(utils, /function showToast/);
  assert.match(utils, /return toast/);
  assert.match(utils, /return null/);
});

test("F1.1.1 flow never wipes global toast tray; only flow-owned outcome", () => {
  const flow = read("js/admin/sa-create-company-flow.js");
  assert.doesNotMatch(flow, /querySelectorAll\(\s*["']\.toast/);
  assert.doesNotMatch(flow, /clearSaCreateOutcomeToasts/);
  assert.match(flow, /showSaCreateOutcomeToast/);
  assert.match(flow, /dismissSaCreateOutcomeToast/);
  assert.match(flow, /data-sa-create-outcome/);
  assert.match(flow, /_saCreateOutcomeToastEl/);
});

test("F1.1.1 production source has no window.__b2c01f1 and no __get/__reset test exports", () => {
  const flow = read("js/admin/sa-create-company-flow.js");
  const sa = read("js/admin/superadmin.js");
  const loader = read("js/admin/sa-create-company-flow-loader.js");
  assert.doesNotMatch(flow, /window\.__b2c01f1/);
  assert.doesNotMatch(flow, /__getSaCreateFlowForTests/);
  assert.doesNotMatch(flow, /__resetSaCreateFlowForTests/);
  assert.doesNotMatch(sa, /__getSaCreateFlowForTests/);
  assert.doesNotMatch(sa, /__resetSaCreateFlowForTests/);
  assert.doesNotMatch(loader, /__setSaCreateFlowLoaderForTests/);
  assert.doesNotMatch(loader, /__resetSaCreateFlowLoaderForTests/);
  assert.doesNotMatch(flow, /_saCreateRefreshCount/);
  assert.doesNotMatch(flow, /window\.USE_LOCAL_STATE/);
  assert.doesNotMatch(sa, /window\.USE_LOCAL_STATE/);
});

test("F1.1.1 E2E/visual do not call __get*/__reset* or write production __b2c01f1", () => {
  const e2e = read("tests/e2e/b2c01-f1-create-company-ca.spec.js");
  const vis = read("tests/e2e/b2c01-f1-visual-trail.spec.js");
  for (const src of [e2e, vis]) {
    assert.doesNotMatch(src, /__getSaCreateFlowForTests/);
    assert.doesNotMatch(src, /__resetSaCreateFlowForTests/);
    assert.doesNotMatch(src, /window\.__b2c01f1\s*=/);
    assert.doesNotMatch(src, /import\(\s*\/\*\s*@vite-ignore/);
    assert.doesNotMatch(src, /window\.USE_LOCAL_STATE\s*=\s*(?:true|false)/);
  }
  assert.match(e2e, /attachDashboardRefreshProbe|dashCompanies/);
  assert.match(e2e, /QA-SENTINEL-UNRELATED-TOAST|data-qa-sentinel/);
  assert.match(vis, /01-load-failure-one-toast\.png/);
  assert.match(vis, /03-retry-success-clean-toast-tray\.png/);
  assert.match(vis, /timeOriginBefore/);
  assert.match(vis, /closeAdditionalChunkRequests/);
  assert.match(vis, /b2c01-f1111-visual/);
});

test("F1.1.1 visual uses truthful CA fixture after createUser", () => {
  const vis = read("tests/e2e/b2c01-f1-visual-trail.spec.js");
  assert.match(vis, /createdCa\.value\s*=/);
  assert.match(vis, /companyAdmins:\s*createdCa\.value\s*\?\s*\[createdCa\.value\]/);
  assert.match(vis, /createUserCount/);
});
