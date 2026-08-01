import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "../..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("Super Admin company edit is server-authorized, audited and separate from Support", () => {
  const api = read("api-server.js");
  const client = read("js/core/api-client.js");
  const screen = read("js/admin/superadmin.js");
  const actions = read("js/register-onclick-staff.js");
  const validation = read("server/validation.js");
  const server = read("server/superadmin-company.js");
  const staff = read("staff.html");
  const source = read("index.legacy-monolith.html");

  assert.match(api, /app\.put\([\s\S]*?\/api\/admin\/company\/:companyId[\s\S]*?requireSuperAdmin[\s\S]*?validateBody\(superAdminCompanyDetailsBody\)/);
  assert.match(client, /async function updateCompanyDetails[\s\S]*?method: "PUT"/);
  assert.match(validation, /const superAdminCompanyDetailsBody[\s\S]*?\.strict\(\)/);
  assert.match(server, /action: "company_details_updated"/);
  assert.match(server, /transaction\.set\(profileRef[\s\S]*?transaction\.set\(settingsRef[\s\S]*?transaction\.set\(auditRef/);
  assert.match(screen, /function superadminEditCompanyDetail/);
  assert.match(screen, /function superadminSaveCompanyDetail/);
  assert.doesNotMatch(screen, /window\.open\(.*company/);
  assert.match(actions, /superadminEditCompanyDetail/);
  assert.match(actions, /superadminSaveCompanyDetail/);
  for (const html of [staff, source]) {
    assert.match(html, /id="sa-detail-edit-btn"[\s\S]*?data-action="superadminEditCompanyDetail"/);
    assert.match(html, /id="sa-detail-support-action-btn"/);
    assert.doesNotMatch(html, /data-action="superadminOpenCompany"/);
  }
});


