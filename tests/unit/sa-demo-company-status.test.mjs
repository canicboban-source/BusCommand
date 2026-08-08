import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(root, "js/admin/superadmin.js"), "utf8");

test("demo company status becomes active when a CA exists", () => {
  assert.match(src, /function _demoCompanyHasAdmin\(/);
  assert.match(src, /_demoCompanyHasAdmin\(companyKey\)/);
  assert.match(src, /Creating a CA means the firm is no longer/);
  assert.match(src, /companyDisp\.status = "active"/);
});

test("demo company detail can save email and country", () => {
  assert.match(src, /function superadminSaveDemoCompanyProfile\(/);
  assert.match(src, /sa-edit-disp-email/);
  assert.match(src, /sa-edit-disp-country/);
  assert.match(src, /sa_country_iso_error|2-letter code/);
});

test("inspect closes SA modal before entering Dispo", () => {
  assert.match(src, /function superadminImpersonate\(/);
  assert.match(src, /superadminCloseCompanyDetail\(\)/);
});

test("SA Open never spawns a production login tab in demo", () => {
  const openStart = src.indexOf("function superadminOpenCompany");
  const openEnd = src.indexOf("let _pendingDetailCompanyId", openStart);
  assert.ok(openStart > -1 && openEnd > openStart, "Open handler missing");
  const openFn = src.slice(openStart, openEnd);
  assert.doesNotMatch(openFn, /window\.open\(/);
  assert.doesNotMatch(openFn, /mode=production/);
  assert.match(openFn, /USE_LOCAL_STATE/);
  assert.match(openFn, /superadminImpersonate/);
  assert.match(openFn, /sa_open_prod_hint|Start support/);
});

test("staff action registry wires demo profile save", () => {
  const registry = fs.readFileSync(path.join(root, "js/register-onclick-staff.js"), "utf8");
  assert.match(registry, /superadminSaveDemoCompanyProfile/);
});
