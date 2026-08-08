import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");

test("QA local-state driver company resolves to COMPANY_ID / qa-local, never hardcoded demo", () => {
  const src = readFileSync(join(root, "js/auth/driver-company.js"), "utf8");
  assert.match(src, /if \(USE_LOCAL_STATE\)/);
  assert.match(src, /qa-local/);
  assert.doesNotMatch(src, /if \(USE_LOCAL_STATE\) return ["']demo["']/);
});

test("clearUserSession does not wipe pretrip seed on cold boot without a user", () => {
  const src = readFileSync(join(root, "js/auth/login-session.js"), "utf8");
  assert.match(src, /hadUser/);
  assert.match(src, /if \(hadUser\)/);
  assert.match(src, /buscommand_pretrip_done/);
});
