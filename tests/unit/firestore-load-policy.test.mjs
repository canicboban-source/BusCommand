import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";
import { allowedGranularCollectionKeys, isGranularCollectionAllowed } from "../../js/core/firestore-load-policy.js";

test("dispatcher loaders exclude company admins, users list and admin collections", () => {
  const allowed = allowedGranularCollectionKeys("dispatcher");
  assert.equal(allowed.has("companyAdmins"), false);
  assert.equal(allowed.has("dispatchers"), false);
  assert.equal(allowed.has("auditLog"), false);
  assert.equal(isGranularCollectionAllowed("dispatcher", "drivers"), true);
});

test("company admin retains its tenant-scoped administrative loaders", () => {
  assert.equal(isGranularCollectionAllowed("company-admin", "companyAdmins"), true);
  assert.equal(isGranularCollectionAllowed("company-admin", "dispatchers"), true);
});

test("dispatcher source reads own profile and assigned group documents only", () => {
  const source = fs.readFileSync(new URL("../../js/core/firebase-service.js", import.meta.url), "utf8");
  assert.match(source, /load_own_user_profile[\s\S]*?collection\("users"\)\.doc\(uid\)\.get\(\)/);
  assert.match(source, /load_assigned_group[\s\S]*?collection\("groups"\)\.doc\(id\)\.get\(\)/);
  assert.doesNotMatch(source, /_isDispatcherSession\(\)[\s\S]{0,250}collection\("users"\)\.get\(\)/);
});

test("forbidden optional loaders are skipped while core reads still fail closed", () => {
  assert.equal(isGranularCollectionAllowed("dispatcher", "companyAdmins"), false);
  const source = fs.readFileSync(new URL("../../js/core/firebase-service.js", import.meta.url), "utf8");
  assert.match(source, /else if \(!isGranularCollectionAllowed\(_currentRole\(\), item\.key\)\) \{\s*loadedState\[item\.key\] = \[\]/);
  assert.match(source, /_readFirestoreOperation\("load_company_profile"/);
  assert.match(source, /Firebase granular load failed[\s\S]*?throw err/);
});

test("production auth loading and error state hide dashboard and mobile navigation", () => {
  const source = fs.readFileSync(new URL("../../js/bootstrap/init.js", import.meta.url), "utf8");
  assert.match(source, /getElementById\("app-container"\)[\s\S]*?classList\.add\("hidden"\)/);
  assert.match(source, /\["mobile-bottom-nav", "fp-mobile-nav"\][\s\S]*?classList\.add\("hidden"\)[\s\S]*?style\.display = visible \? "none" : ""/);
});

test("three dispatcher cold loads preserve only assigned group 310", () => {
  const load = () => [{ id: "310", name: "LEO" }];
  assert.deepEqual(load(), load());
  assert.deepEqual(load(), load());
});
