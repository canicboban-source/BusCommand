import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createEphemeralQaState } = require("../e2e/qa-factory.js");

test("QA factory seeds stable entity ids and non-empty branding for CA shell routing", () => {
  const fx = createEphemeralQaState({ companyId: "qa-local", groupId: "101" });
  assert.equal(fx.state.drivers[0].id, "drv-e2e");
  assert.equal(fx.state.dispatchers.find((d) => !d.isSuperAdmin)?.id, "dispo-qa-1");
  assert.equal(fx.state.companyAdmins[0].id, "ca-qa-1");
  assert.equal(String(fx.state.branding?.name || "").trim().length > 0, true);
  assert.notEqual(fx.state.branding.name, "BusCommand");
});
