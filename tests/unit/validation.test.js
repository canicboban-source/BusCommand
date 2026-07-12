const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  driverLoginBody,
  createCompanyBody,
  createUserBody,
  assertCompanyIdUsable,
  sanitizeCompanyId
} = require("../../server/validation.js");

test("driverLoginBody rejects empty object", () => {
  const result = driverLoginBody.safeParse({});
  assert.equal(result.success, false);
});

test("driverLoginBody accepts valid demo login", () => {
  const result = driverLoginBody.safeParse({
    companyId: "demo",
    driverId: "drv-1",
    pin: "1234"
  });
  assert.equal(result.success, true);
});

test("driverLoginBody rejects short PIN", () => {
  const result = driverLoginBody.safeParse({
    companyId: "demo",
    driverId: "drv-1",
    pin: "12"
  });
  assert.equal(result.success, false);
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

test("assertCompanyIdUsable blocks reserved demo id", () => {
  assert.equal(assertCompanyIdUsable("demo"), "companyId je rezervisan.");
});

test("sanitizeCompanyId strips invalid characters", () => {
  assert.equal(sanitizeCompanyId("  Acme-Bus!! "), "acme-bus");
});
