/**
 * FAZA 2R-B — plan-import lazy chunk (D17 staff cut).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");

test("2R-B source: register-onclick-staff lazy-loads plan-import (no static import)", () => {
  const src = fs.readFileSync(path.join(root, "js/register-onclick-staff.js"), "utf8");
  assert.doesNotMatch(
    src,
    /import\s*\{[^}]*confirmBulkPlanImport[^}]*\}\s*from\s*["']\.\/dispatcher\/plan-import\.js["']/
  );
  assert.match(src, /from\s*["']\.\/dispatcher\/plan-import-loader\.js["']/);
  assert.match(src, /loadPlanImport|prefetchPlanImport/);
  assert.match(src, /withPlanImportModule/);
  assert.match(src, /openMonthlyPlansFullCore|openMonthlyPlanImportCore/);
  const loader = fs.readFileSync(path.join(root, "js/dispatcher/plan-import-loader.js"), "utf8");
  assert.match(loader, /import\(\s*["']\.\/plan-import\.js["']\s*\)/);
});

test("2R-B source: data-hub does not statically import plan-import", () => {
  const src = fs.readFileSync(path.join(root, "js/dispatcher/data-hub.js"), "utf8");
  assert.doesNotMatch(src, /import\s*\{[^}]*renderPlanImportPreview[^}]*\}\s*from\s*["']\.\/plan-import\.js["']/);
  assert.match(src, /import\(\s*["']\.\/plan-import\.js["']\s*\)/);
});

test("2R-B source: plan-import does not statically import data-hub/monthly-plans (cycle broken)", () => {
  const src = fs.readFileSync(path.join(root, "js/dispatcher/plan-import.js"), "utf8");
  assert.doesNotMatch(src, /import\s*\{[^}]*renderDispatcherDataHub[^}]*\}\s*from\s*["']\.\/data-hub\.js["']/);
  assert.doesNotMatch(src, /import\s*\{[^}]*renderMonthlyPlansView[^}]*\}\s*from\s*["']\.\/monthly-plans\.js["']/);
  assert.match(src, /import\(\s*["']\.\/monthly-plans\.js["']\s*\)/);
  assert.match(src, /import\(\s*["']\.\/data-hub\.js["']\s*\)/);
});

test("2R-B: built staff.html must not modulepreload plan-import chunk", () => {
  const staffHtml = path.join(root, "dist", "staff.html");
  if (!fs.existsSync(staffHtml)) {
    // Build not present yet — source contract still enforced above.
    return;
  }
  const html = fs.readFileSync(staffHtml, "utf8");
  const preloads = [...html.matchAll(/rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/g)]
    .map((m) => m[1]);
  for (const href of preloads) {
    assert.doesNotMatch(
      href,
      /plan-import/i,
      `staff.html must not modulepreload plan-import chunk: ${href}`
    );
  }
  // Also reject script tags that would eagerly load a plan-import named asset.
  assert.doesNotMatch(html, /src=["'][^"']*plan-import[^"']*["']/i);
});
