import test from "node:test";
import assert from "node:assert/strict";
import { companyDriverProfileBody, companyDriverCreateBody } from "../../server/validation.js";
import {
  normalizeKnownGroupIds,
  driverKnowsGroup
} from "../../js/data/driver-known-groups.js";

test("normalizeKnownGroupIds always includes home group and dedupes", () => {
  assert.deepEqual(
    normalizeKnownGroupIds({ groupId: "310", knownGroupIds: ["550", "310", "200", "550"] }),
    ["310", "550", "200"]
  );
  assert.deepEqual(
    normalizeKnownGroupIds({ groupId: "101", knownGroupIds: [] }),
    ["101"]
  );
});

test("driverKnowsGroup uses known list plus home group", () => {
  const driver = { groupId: "310", knownGroupIds: ["550"] };
  assert.equal(driverKnowsGroup(driver, "310"), true);
  assert.equal(driverKnowsGroup(driver, "550"), true);
  assert.equal(driverKnowsGroup(driver, "200"), false);
});

test("companyDriverProfileBody accepts editable knownGroupIds without credentials", () => {
  const ok = companyDriverProfileBody.safeParse({
    companyId: "acme",
    firstName: "Ana",
    lastName: "Test",
    phone: "+431234567",
    email: "ana@example.test",
    groupId: "310",
    knownGroupIds: ["310", "550", "200"]
  });
  assert.equal(ok.success, true);
  assert.deepEqual(ok.data.knownGroupIds, ["310", "550", "200"]);

  const rejected = companyDriverProfileBody.safeParse({
    companyId: "acme",
    firstName: "Ana",
    lastName: "Test",
    phone: "+431234567",
    email: "ana@example.test",
    groupId: "310",
    knownGroupIds: ["310"],
    pin: "12345"
  });
  assert.equal(rejected.success, false);
});

test("companyDriverProfileBody accepts an optional postalCode", () => {
  const withCode = companyDriverProfileBody.safeParse({
    companyId: "acme", firstName: "Ana", lastName: "Test",
    phone: "+431234567", email: "ana@example.test", groupId: "310",
    postalCode: "2340"
  });
  assert.equal(withCode.success, true);
  assert.equal(withCode.data.postalCode, "2340");

  const withoutCode = companyDriverProfileBody.safeParse({
    companyId: "acme", firstName: "Ana", lastName: "Test",
    phone: "+431234567", email: "ana@example.test", groupId: "310"
  });
  assert.equal(withoutCode.success, true);
  assert.equal(withoutCode.data.postalCode, undefined);

  const tooLong = companyDriverProfileBody.safeParse({
    companyId: "acme", firstName: "Ana", lastName: "Test",
    phone: "+431234567", email: "ana@example.test", groupId: "310",
    postalCode: "12345678901"
  });
  assert.equal(tooLong.success, false);
});

test("companyDriverCreateBody accepts an optional postalCode", () => {
  const result = companyDriverCreateBody.safeParse({
    companyId: "acme", eid: "EID-1", firstName: "Ana", lastName: "Test",
    phone: "+431234567", email: "ana@example.test", groupId: "310",
    postalCode: "1010", companyCode: "12345"
  });
  assert.equal(result.success, true);
  assert.equal(result.data.postalCode, "1010");
});
