const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createCompanyBody,
  createUserBody,
  companyBrandingBody,
  companyGroupBody,
  companyGroupUpdateBody,
  companyDispatcherBody,
  companyDispatcherStatusBody,
  companyDispatcherDeleteBody,
  companyProfileSettingsBody,
  assertCompanyIdUsable,
  sanitizeCompanyId
} = require("../../server/validation.js");

test("dispatcher deletion requires tenant and exact email-shaped confirmation", () => {
  assert.equal(companyDispatcherDeleteBody.safeParse({
    companyId: "alpha",
    confirmEmail: " dispatcher@example.test "
  }).success, true);
  assert.equal(companyDispatcherDeleteBody.safeParse({
    companyId: "alpha",
    confirmEmail: "dispatcher"
  }).success, false);
  assert.equal(companyDispatcherDeleteBody.safeParse({
    companyId: "alpha",
    confirmEmail: "dispatcher@example.test",
    active: false
  }).success, false);
});

test("createCompanyBody requires name", () => {
  const result = createCompanyBody.safeParse({ companyId: "acme" });
  assert.equal(result.success, false);
});

test("createUserBody requires companyId for dispatcher", () => {
  const result = createUserBody.safeParse({
    email: "d@acme.com",
    password: "secret12",
    role: "dispatcher"
  });
  assert.equal(result.success, false);
});

test("createUserBody rejects minting superadmin via admin API", () => {
  const result = createUserBody.safeParse({
    email: "root@example.test",
    password: "unit-test-password",
    role: "superadmin",
    companyId: "alpha"
  });
  assert.equal(result.success, false);
});

test("assertCompanyIdUsable blocks reserved demo id", () => {
  assert.equal(assertCompanyIdUsable("demo"), "companyId je rezervisan.");
});

test("sanitizeCompanyId strips invalid characters", () => {
  assert.equal(sanitizeCompanyId("  Acme-Bus!! "), "acme-bus");
});

test("companyBrandingBody accepts normalized HTTPS branding", () => {
  const result = companyBrandingBody.safeParse({
    companyId: "acme-bus",
    name: "  Acme Transit  ",
    primaryColor: "#10b981",
    logoUrl: "https://cdn.example.test/acme.png"
  });
  assert.equal(result.success, true);
  assert.equal(result.data.name, "Acme Transit");
  assert.equal(result.data.primaryColor, "#10B981");
});

test("companyBrandingBody rejects HTTP, credentials and malformed color", () => {
  for (const input of [
    { companyId: "acme", name: "Acme", primaryColor: "green", logoUrl: "https://example.test/logo.png" },
    { companyId: "acme", name: "Acme", primaryColor: "#10B981", logoUrl: "http://example.test/logo.png" },
    { companyId: "acme", name: "Acme", primaryColor: "#10B981", logoUrl: "https://user:pass@example.test/logo.png" }
  ]) {
    assert.equal(companyBrandingBody.safeParse(input).success, false);
  }
});

test("company group schemas normalize safe metadata and keep the ID immutable on update", () => {
  const created = companyGroupBody.safeParse({
    companyId: "alpha",
    id: "310",
    name: " Line 310 ",
    description: " North depot ",
    color: "#10b981"
  });
  assert.equal(created.success, true);
  assert.equal(created.data.color, "#10B981");
  assert.equal(companyGroupBody.safeParse({ companyId: "alpha", id: "north", name: "North", color: "#10B981" }).success, false);
  assert.equal(companyGroupUpdateBody.safeParse({ companyId: "alpha", id: "105", name: "Line 310", color: "#10B981" }).success, true);
  assert.equal("id" in companyGroupUpdateBody.parse({ companyId: "alpha", id: "105", name: "Line 310", color: "#10B981" }), false);
});

test("company dispatcher schemas require a strong password, group and explicit status", () => {
  const valid = companyDispatcherBody.safeParse({
    companyId: "alpha", name: "Ana Dispatcher", email: "ANA@example.test",
    password: "safe-password-123", groups: ["310"]
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.email, "ana@example.test");
  assert.equal(companyDispatcherBody.safeParse({
    companyId: "alpha", name: "Ana", email: "ana@example.test", password: "abc123", groups: ["310"]
  }).success, true);
  assert.equal(companyDispatcherBody.safeParse({
    companyId: "alpha", name: "Ana", email: "ana@example.test", password: "ab123", groups: ["310"]
  }).success, false);
  assert.equal(companyDispatcherBody.safeParse({
    companyId: "alpha", name: "Ana", email: "ana@example.test", password: "short1", groups: []
  }).success, false);
  assert.equal(companyDispatcherStatusBody.safeParse({ companyId: "alpha", active: false }).success, true);
  assert.equal(companyDispatcherStatusBody.safeParse({ companyId: "alpha", active: "false" }).success, false);
});

test("company profile settings schema supports only pilot headquarters and languages", () => {
  assert.equal(companyProfileSettingsBody.safeParse({
    companyId: "alpha", country: "AT", defaultLanguage: "de", contactEmail: "office@example.at"
  }).success, true);
  assert.equal(companyProfileSettingsBody.safeParse({
    companyId: "alpha", country: "US", defaultLanguage: "fr", contactEmail: "bad"
  }).success, false);
});
