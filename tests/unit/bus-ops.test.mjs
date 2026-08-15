import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  busIsAssignable,
  busRevisionOf,
  normalizeBusGarage,
  normalizeBusOpsStatus
} from "../../js/data/bus-ops.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("normalizeBusOpsStatus defaults to active and rejects unknown", () => {
  assert.equal(normalizeBusOpsStatus({}), "active");
  assert.equal(normalizeBusOpsStatus({ opsStatus: "breakdown" }), "breakdown");
  assert.equal(normalizeBusOpsStatus({ opsStatus: "reserve" }), "reserve");
  assert.equal(normalizeBusOpsStatus({ opsStatus: "other_line" }), "other_line");
  assert.equal(normalizeBusOpsStatus({ opsStatus: "weird" }), "active");
});

test("normalizeBusGarage trims and caps length", () => {
  assert.equal(normalizeBusGarage({ garage: "  Depot A  " }), "Depot A");
  assert.equal(normalizeBusGarage({ garage: "x".repeat(50) }).length, 40);
});

test("busIsAssignable allows active or reserve, blocks breakdown/other_line (D21)", () => {
  assert.equal(busIsAssignable({ active: true, opsStatus: "active" }), true);
  assert.equal(busIsAssignable({ active: true, opsStatus: "reserve" }), true);
  assert.equal(busIsAssignable({ active: false, opsStatus: "active" }), false);
  assert.equal(busIsAssignable({ active: true, opsStatus: "breakdown" }), false);
  assert.equal(busIsAssignable({ active: true, opsStatus: "other_line" }), false);
});

test("busRevisionOf defaults missing revision to 0", () => {
  assert.equal(busRevisionOf({}), 0);
  assert.equal(busRevisionOf({ revision: 3 }), 3);
  assert.equal(busRevisionOf({ revision: -1 }), 0);
});

test("client and server wire bus expectedRevision without reason fields", () => {
  const client = readFileSync(join(root, "js/data/buses-routes.js"), "utf8");
  const api = readFileSync(join(root, "js/core/api-client.js"), "utf8");
  const routes = readFileSync(join(root, "server/driver-routes.js"), "utf8");
  assert.match(client, /expectedRevision/);
  assert.match(client, /REVISION_CONFLICT/);
  assert.match(client, /GARAGE_BUSY/);
  assert.doesNotMatch(client, /name=["']reason["']/);
  assert.doesNotMatch(client, /name=["']description["']/);
  assert.match(api, /expectedRevision/);
  assert.match(routes, /busProfileSchema/);
  assert.match(routes, /expectedRevision: z\.number\(\)\.int\(\)\.min\(0\)/);
  assert.match(routes, /GARAGE_BUSY/);
  assert.match(routes, /REVISION_CONFLICT/);
});
