import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("D1 openGroupHub adopts active group on currentUser and dispatcher record", () => {
  const src = fs.readFileSync(path.join(root, "js/dispatcher/group-hub.js"), "utf8");
  assert.match(src, /function adoptActiveGroup\(/);
  assert.match(src, /currentUser\.activeGroupId = groupId/);
  assert.match(src, /openGroupHub[\s\S]*adoptActiveGroup\(groupId\)/);
  assert.match(src, /openDailyPlanForGroup[\s\S]*adoptActiveGroup\(groupId\)/);
  assert.match(src, /openMonthlyPlanForGroup[\s\S]*adoptActiveGroup\(groupId\)/);
});

test("C4 hub has sticky readonly banner slot for Company Admin", () => {
  const html = fs.readFileSync(path.join(root, "index.legacy-monolith.html"), "utf8");
  const hub = fs.readFileSync(path.join(root, "js/dispatcher/group-hub.js"), "utf8");
  assert.match(html, /id="ops-readonly-banner-slot"/);
  assert.match(hub, /ops-readonly-banner-slot/);
  assert.match(hub, /position:sticky/);
});

test("D3 dropzone i18n mentions images/OCR", () => {
  const tr = fs.readFileSync(path.join(root, "translations.js"), "utf8");
  assert.match(tr, /hub_plan_drop_hint: "Drop Excel\/CSV\/PDF\/TXT\/image \(OCR\)"/);
  assert.match(tr, /import_plan_only_drop: "Drop plans \(\.xlsx\/\.csv\/\.pdf/);
});

test("C2 staff login role hint exists", () => {
  const html = fs.readFileSync(path.join(root, "index.legacy-monolith.html"), "utf8");
  const tr = fs.readFileSync(path.join(root, "translations.js"), "utf8");
  assert.match(html, /data-i18n="staff_login_role_hint"/);
  assert.match(html, /data-i18n="staff_login_tab"/);
  assert.match(tr, /staff_login_role_hint:/);
  assert.match(tr, /staff_login_tab:/);
});

test("D21 orphan CA monthly-import client module is removed", () => {
  const orphan = path.join(root, "js/admin/company-admin-monthly-import.js");
  assert.equal(fs.existsSync(orphan), false);
  const registry = fs.readFileSync(path.join(root, "js/register-onclick-staff.js"), "utf8");
  assert.doesNotMatch(registry, /company-admin-monthly-import/);
});
