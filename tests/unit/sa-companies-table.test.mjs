import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("SA companies panel uses table rows and create modal", () => {
  const html = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
  const js = readFileSync(join(root, "js/admin/superadmin.js"), "utf8");
  assert.match(html, /sa-companies-table/);
  assert.match(html, /sa-create-company-modal/);
  assert.match(html, /sa_new_company_admin/);
  assert.doesNotMatch(html, /sa-companies-stack/);
  assert.match(js, /_saCompanyRowHtml/);
  assert.match(js, /superadminOpenCreateModal/);
  assert.match(js, /rowActionsMenuHtml/);
});

test("messages send button forced to primary blue; attention uses resolve label", () => {
  const css = readFileSync(join(root, "css/staff-desktop.css"), "utf8");
  const dash = readFileSync(join(root, "js/dispatcher/dashboard.js"), "utf8");
  assert.match(css, /#dispatcher-messages \.msg-compose-submit[\s\S]*#3b82f6/);
  assert.match(css, /ops-action-card[\s\S]*245,\s*158,\s*11/);
  assert.match(dash, /ops_btn_resolve/);
});
