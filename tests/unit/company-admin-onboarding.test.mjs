import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";

import { resolveCompanyAdminOnboarding } from "../../js/admin/company-admin-onboarding-model.js";

const ca = { role: "company-admin", companyId: "alpha" };

test("wizard stays hidden when group and dispatcher already exist (re-login safe)", () => {
  const status = resolveCompanyAdminOnboarding({
    branding: { name: "Alpha" },
    groups: [{ id: "310", companyId: "alpha" }],
    dispatchers: [{ id: "d1", companyId: "alpha", role: "dispatcher" }],
    companyAdminOnboardingDone: false
  }, ca);
  assert.equal(status.show, false);
  assert.equal(status.alreadyProvisioned, true);
});

test("wizard ignores session-only done flag when provisioning is incomplete", () => {
  const status = resolveCompanyAdminOnboarding({
    branding: { name: "Alpha" },
    groups: [],
    dispatchers: [],
    companyAdminOnboardingDone: true
  }, ca);
  assert.equal(status.show, true);
  assert.equal(status.startStep, 2);
});

test("wizard starts at branding when nothing is provisioned", () => {
  const status = resolveCompanyAdminOnboarding({
    branding: {},
    groups: [],
    dispatchers: []
  }, ca);
  assert.equal(status.show, true);
  assert.equal(status.startStep, 1);
});

test("wizard skips branding when name exists but no group", () => {
  const status = resolveCompanyAdminOnboarding({
    branding: { name: "Alpha Transit" },
    groups: [],
    dispatchers: []
  }, ca);
  assert.equal(status.show, true);
  assert.equal(status.startStep, 2);
});

test("wizard jumps to dispatcher step when group exists without dispatcher", () => {
  const status = resolveCompanyAdminOnboarding({
    branding: { name: "Alpha" },
    groups: [{ id: "310", companyId: "alpha" }],
    dispatchers: [{ id: "ca-1", companyId: "alpha", role: "company_admin" }]
  }, ca);
  assert.equal(status.show, true);
  assert.equal(status.startStep, 3);
  assert.equal(status.hasDispatcher, false);
});

test("wizard does not show for non-CA roles", () => {
  assert.equal(resolveCompanyAdminOnboarding({
    groups: [],
    dispatchers: []
  }, { role: "dispatcher", companyId: "alpha" }).show, false);
});

test("wizard ignores malformed empty group and dispatcher entries", () => {
  const status = resolveCompanyAdminOnboarding({
    branding: { name: "Alpha" },
    groups: [undefined, null, false],
    dispatchers: [undefined, null]
  }, ca);
  assert.equal(status.show, true);
  assert.equal(status.hasGroup, false);
  assert.equal(status.hasDispatcher, false);
  assert.equal(status.startStep, 2);
});

test("onboarding UI uses resolveCompanyAdminOnboarding instead of done-flag alone", () => {
  const source = fs.readFileSync(new URL("../../js/admin/company-admin-onboarding.js", import.meta.url), "utf8");
  assert.match(source, /resolveCompanyAdminOnboarding/);
  assert.match(source, /status\.startStep/);
  assert.doesNotMatch(source, /return !window\.state\.companyAdminOnboardingDone/);
});
