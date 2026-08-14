/**
 * B2C-01-F1.1.1.1-A — Escape no-load accessibility contracts.
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

test("F1.1.1.1-A unloaded Escape uses document guard + sync shell focus", () => {
  const sa = read("js/admin/superadmin.js");
  assert.match(sa, /bindSaCreateUnloadedEscapeGuard/);
  assert.match(sa, /unbindSaCreateUnloadedEscapeGuard/);
  assert.match(sa, /focusSaCreateModalShellSync/);
  assert.match(sa, /document\.addEventListener\(\s*["']keydown["']\s*,\s*_saCreateUnloadedEscapeGuard\s*,\s*true\s*\)/);
  assert.match(sa, /document\.removeEventListener\(\s*["']keydown["']\s*,\s*_saCreateUnloadedEscapeGuard\s*,\s*true\s*\)/);
  assert.match(sa, /focusSaCreateModalShellSync\(\)/);
  // Old modal-only bind must not remain as sole Escape path.
  assert.doesNotMatch(sa, /dataset\.saShellEscapeBound/);
  assert.doesNotMatch(sa, /ensureSaCreateShellEscapeClose/);
});

test("F1.1.1.1-A successful load unbinds unloaded Escape guard", () => {
  const sa = read("js/admin/superadmin.js");
  assert.match(
    sa,
    /dismissSaCreateLoaderFailureToast\(\);\s*\/\/[\s\S]*?unbindSaCreateUnloadedEscapeGuard\(\)/
  );
  assert.match(sa, /function dismissSaCreateModalShellLocal[\s\S]*?unbindSaCreateUnloadedEscapeGuard\(\)/);
});

test("F1.1.1.1-A no new production ForTests / b2c01 hooks", () => {
  const sa = read("js/admin/superadmin.js");
  assert.doesNotMatch(sa, /ForTests/);
  assert.doesNotMatch(sa, /window\.__b2c01f1/);
  assert.doesNotMatch(sa, /window\.USE_LOCAL_STATE/);
});

test("F1.1.1.1-A loaded flow still owns Escape via leave-confirm close", () => {
  const flow = read("js/admin/sa-create-company-flow.js");
  assert.match(flow, /_saCreateEscapeBound/);
  assert.match(flow, /function superadminCloseCreateModal/);
  assert.match(flow, /showSaCreateLeaveConfirm/);
  assert.match(
    flow,
    /COMPANY_CREATED_CA_PENDING[\s\S]*?showSaCreateLeaveConfirm\(\)/
  );
});
