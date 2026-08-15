import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { URL } from "node:url";
import { canOpenSection, canRunCompanyAdminAction, canRunFactoryReset } from "../../js/core/ui-permissions.js";
import { runSingleSubmission } from "../../js/core/submit-lock.js";
import { safeDriverExportRows } from "../../js/core/export-policy.js";

test("production dispatcher cannot open company settings or run admin actions", () => {
  assert.equal(canOpenSection("dispatcher", "dispatcher-settings", false), false);
  assert.equal(canOpenSection("dispatcher", "dispatcher-settings", true), false);
  assert.equal(canOpenSection("dispatcher", "company-admin-settings", false), false);
  assert.equal(canRunCompanyAdminAction("dispatcher"), false);
  assert.equal(canRunFactoryReset("dispatcher", false), false);
});

test("company admin retains own-company administration sections but production reset stays disabled", () => {
  assert.equal(canOpenSection("company_admin", "company-admin-team", false), true);
  assert.equal(canOpenSection("company_admin", "company-admin-settings", false), true);
  assert.equal(canOpenSection("company_admin", "dispatcher-settings", false), false);
  assert.equal(canOpenSection("company_admin", "dispatcher-group-hub", false), true);
  assert.equal(canOpenSection("company_admin", "dispatcher-messages", false), false);
  assert.equal(canRunCompanyAdminAction("company_admin"), true);
  assert.equal(canRunFactoryReset("company_admin", false), false);
});

test("single-submission lock ignores a rapid second click and restores the button", async () => {
  let calls = 0;
  let release;
  const label = { textContent: "Add Admin" };
  const button = {
    disabled: false,
    attrs: new Map(),
    querySelector: () => label,
    setAttribute(key, value) { this.attrs.set(key, value); },
    removeAttribute(key) { this.attrs.delete(key); }
  };
  const task = () => new Promise(resolve => { calls += 1; release = resolve; });
  const first = runSingleSubmission(button, "Creating...", task);
  const second = await runSingleSubmission(button, "Creating...", task);
  assert.equal(second.started, false);
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(label.textContent, "Creating...");
  release("ok");
  assert.deepEqual(await first, { started: true, value: "ok" });
  assert.equal(button.disabled, false);
  assert.equal(label.textContent, "Add Admin");
});

test("security-sensitive production labels have distinct EN, DE and SR translations", () => {
  const source = fs.readFileSync(new URL("../../translations.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  for (const key of ["add_new_company", "btn_register_company", "creating", "error_access_denied", "btn_print_schedule"]) {
    const values = ["en", "de", "sr"].map(lang => context.window.TRANSLATIONS[lang][key]);
    assert.ok(values.every(Boolean), `${key} must exist in EN/DE/SR`);
    assert.equal(new Set(values).size, 3, `${key} must not fall back to another selected language`);
  }
});

test("production company form has i18n labels and no visible PIN field", () => {
  // Staff surface hosts SA/CA forms; index.html is the surface gate only.
  // Prefer source monolith (build may lag); staff.html must stay in sync after npm run build.
  const html = fs.readFileSync(new URL("../../index.legacy-monolith.html", import.meta.url), "utf8");
  assert.match(html, /data-i18n="add_new_company"/);
  assert.match(html, /id="sa-create-company-modal"/);
  assert.match(html, /id="sa-demo-company-pin" class="form-group hidden"/);
  assert.match(html, /data-i18n="btn_register_company"/);
  assert.match(html, /data-i18n="sa_new_company_admin"/);
  assert.doesNotMatch(html, /id="company-admin-settings"[\s\S]*?data-i18n="btn_print_schedule"[\s\S]*?<!-- MOBILNA BOTTOM/);
  assert.doesNotMatch(html, /Register New Company \/ Dispatcher/);
});

test("driver export is tenant-scoped and excludes identity and login secrets", () => {
  const rows = safeDriverExportRows([
    { name: "Own Driver", bus: "10", groupId: "A", companyId: "alpha", eid: "hidden", company_code: "hidden", loginCodeHash: "hidden" },
    { name: "Other Driver", bus: "20", groupId: "B", companyId: "beta", eid: "other" }
  ], "alpha");
  assert.deepEqual(rows, [["Own Driver", "10", "A"]]);
  assert.equal(JSON.stringify(rows).includes("hidden"), false);
  assert.equal(JSON.stringify(rows).includes("Other Driver"), false);
});
