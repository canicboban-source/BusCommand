const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "../..");

test("credential Firebase codes share one enumeration-safe error key", async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, "js/auth/staff-login-errors.js")).href);
  const { staffAuthErrorKey, isHardStaffAuthError } = mod;

  const credentialCodes = [
    "auth/user-not-found",
    "auth/wrong-password",
    "auth/invalid-credential",
    "auth/invalid-login-credentials"
  ];
  for (const code of credentialCodes) {
    assert.equal(staffAuthErrorKey(code), "error_invalid_credentials", code);
    assert.equal(isHardStaffAuthError(code), true, code);
  }

  assert.equal(staffAuthErrorKey("auth/user-disabled"), "error_account_disabled");
  assert.equal(staffAuthErrorKey("auth/too-many-requests"), "error_too_many_requests");
  assert.equal(staffAuthErrorKey(""), "error_invalid_credentials");
});

test("staff login UI maps user-not-found and wrong-password to the same key", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/auth/login-dispatcher.js"), "utf8");
  assert.match(source, /staffAuthErrorKey/);
  assert.match(source, /error_invalid_credentials/);
  assert.doesNotMatch(source, /error_user_not_found/);
  assert.doesNotMatch(source, /error_wrong_password/);
  assert.match(source, /password_reset_generic/);
  assert.doesNotMatch(source, /err\.code === "auth\/user-not-found"/);
});

test("auth-client loginWithEmail returns errorKey, not Serbian literals", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/core/auth-client.js"), "utf8");
  assert.match(source, /staffAuthErrorKey/);
  assert.match(source, /errorKey:\s*staffAuthErrorKey/);
  assert.doesNotMatch(source, /Email adresa nije pronađena/);
  assert.doesNotMatch(source, /Pogrešna lozinka/);
});

test("error_invalid_credentials exists for sr/en/de", () => {
  const source = fs.readFileSync(path.join(ROOT, "translations.js"), "utf8");
  assert.match(source, /error_invalid_credentials:\s*\{/);
  assert.match(source, /sr:\s*"Pogrešan email ili lozinka\."/);
  assert.match(source, /en:\s*"Wrong email or password\."/);
  assert.match(source, /de:\s*"Falsche E-Mail oder falsches Passwort\."/);
});
