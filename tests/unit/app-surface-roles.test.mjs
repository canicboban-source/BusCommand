import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("isStaffRole accepts only dispatcher / company-admin / superadmin", async () => {
  globalThis.window = { __BUSCOMMAND_SURFACE__: "staff", location: { pathname: "/staff.html" } };
  globalThis.document = { documentElement: { dataset: { appSurface: "staff" } }, body: { dataset: {} } };
  const mod = await import(pathToFileURL(path.join(root, "js/core/app-surface.js")).href + `?v=${Date.now()}`);
  assert.equal(mod.isStaffRole("dispatcher"), true);
  assert.equal(mod.isStaffRole("company-admin"), true);
  assert.equal(mod.isStaffRole("company_admin"), true);
  assert.equal(mod.isStaffRole("superadmin"), true);
  assert.equal(mod.isStaffRole("driver"), false);
  assert.equal(mod.isStaffRole(""), false);
  assert.equal(mod.isStaffRole(null), false);
  assert.equal(mod.assertSurfaceRole("dispatcher"), true);
  assert.equal(mod.assertSurfaceRole("driver"), false);
});

test("driver surface rejects staff roles", async () => {
  globalThis.window = { __BUSCOMMAND_SURFACE__: "driver", location: { pathname: "/driver.html" } };
  globalThis.document = { documentElement: { dataset: { appSurface: "driver" } }, body: { dataset: {} } };
  const mod = await import(pathToFileURL(path.join(root, "js/core/app-surface.js")).href + `?v=${Date.now() + 1}`);
  assert.equal(mod.assertSurfaceRole("driver"), true);
  assert.equal(mod.assertSurfaceRole("dispatcher"), false);
  assert.equal(mod.assertSurfaceRole("company-admin"), false);
});
