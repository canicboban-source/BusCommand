/**
 * Remote render registry contract.
 * Proves firebase-service no longer uses variable dynamic import for snapshot re-renders.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const FIREBASE_SERVICE = path.join(ROOT, "js/core/firebase-service.js");
const REGISTRY = path.join(ROOT, "js/core/remote-render-registry.js");
const DRIVER_ENTRY = [
  path.join(ROOT, "js/main-driver.js"),
  path.join(ROOT, "js/install-driver.js"),
  path.join(ROOT, "js/surface/register-driver-sections.js")
];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

test("firebase-service.js must not use variable dynamic import for remote render", () => {
  const src = read(FIREBASE_SERVICE);
  assert.doesNotMatch(src, /await\s+import\s*\(\s*modulePath\s*\)/, "must not import(modulePath)");
  assert.doesNotMatch(src, /await\s+import\s*\(\s*e\s*\)/, "must not import(e) for remote render");
  assert.doesNotMatch(
    src,
    /_invokeRender\s*\(\s*["']\.\.\/(admin|dispatcher|driver)\//,
    "must not pass legacy modulePath strings into the invoke helper"
  );
  assert.doesNotMatch(
    src,
    /["']\.\.\/admin\/company-admin(?:-drivers)?\.js["']/,
    "must not keep leftover admin modulePath strings"
  );
  assert.doesNotMatch(
    src,
    /["']\.\.\/dispatcher\/(?:shifts|dashboard|reports)\.js["']/,
    "must not keep leftover dispatcher modulePath strings"
  );
  assert.doesNotMatch(
    src,
    /["']\.\.\/driver\/(?:dashboard|messages-inbox)\.js["']/,
    "must not keep leftover driver modulePath strings"
  );
});

test("driver entry graph does not import staff/admin/dispatcher UI modules", () => {
  for (const file of DRIVER_ENTRY) {
    const src = read(file);
    assert.doesNotMatch(src, /from\s+["'][^"']*\/admin\//, `${path.basename(file)} must not import admin UI`);
    assert.doesNotMatch(src, /from\s+["'][^"']*\/dispatcher\//, `${path.basename(file)} must not import dispatcher UI`);
  }
});

test("registry invokes only the registered callback and isolates errors", async () => {
  const registry = await import(pathToFileUrl(REGISTRY));
  registry.resetRemoteRenderRegistryForTests();

  const calls = [];
  registry.registerRemoteRenderCallback("renderCompanyAdminDashboard", (arg) => {
    calls.push(["dashboard", arg]);
  });
  registry.registerRemoteRenderCallback("renderCompanyAdminDrivers", (arg) => {
    calls.push(["drivers", arg]);
  });
  registry.registerRemoteRenderCallback("renderDispatcherDashboard", () => {
    calls.push(["dispatcher"]);
  });
  registry.registerRemoteRenderCallback("renderDriverDashboard", () => {
    calls.push(["driver"]);
  });

  registry.invokeRemoteRender("renderCompanyAdminDashboard", { tick: 1 });
  assert.deepEqual(calls, [["dashboard", { tick: 1 }]]);

  calls.length = 0;
  assert.doesNotThrow(() => registry.invokeRemoteRender("renderCompanyAdminDrivers", "keep"));
  assert.deepEqual(calls, [["drivers", "keep"]]);

  calls.length = 0;
  assert.doesNotThrow(() => registry.invokeRemoteRender("missing-name"));
  assert.deepEqual(calls, []);

  registry.registerRemoteRenderCallback("renderCompanyAdminDashboard", () => {
    throw new Error("secret-token-must-not-escape");
  });
  assert.doesNotThrow(() => registry.invokeRemoteRender("renderCompanyAdminDashboard"));

  assert.throws(
    () => registry.registerRemoteRenderCallback("not-a-real-callback", () => {}),
    /unknown|not allowed|unapproved/i
  );
  assert.throws(
    () => registry.registerRemoteRenderCallback("renderCompanyAdminDashboard", "nope"),
    /function/i
  );

  const second = [];
  registry.registerRemoteRenderCallback("renderDispatcherDashboard", () => second.push("a"));
  registry.registerRemoteRenderCallback("renderDispatcherDashboard", () => second.push("b"));
  registry.invokeRemoteRender("renderDispatcherDashboard");
  assert.deepEqual(second, ["b"], "re-register replaces the previous callback; no double call");

  registry.resetRemoteRenderRegistryForTests();
});

test("remote snapshot handler uses registry and honors role/section gates", async () => {
  globalThis.window = Object.assign(globalThis.window || {}, {
    location: { hostname: "localhost", search: "" },
    TRANSLATIONS: { en: {}, sr: {}, de: {} },
    currentUser: { role: "company-admin", name: "CA" },
    state: { drivers: [] }
  });
  const dashboard = { id: "company-admin-dashboard", classList: { contains: () => false } };
  const drivers = { id: "company-admin-drivers", classList: { contains: () => false } };
  let active = dashboard;
  globalThis.document = {
    querySelector: (sel) => (sel === ".content-section:not(.hidden)" ? active : null)
  };

  const registry = await import(pathToFileUrl(REGISTRY));
  registry.resetRemoteRenderRegistryForTests();
  const { handleRemoteCollectionUpdate } = await import(pathToFileUrl(FIREBASE_SERVICE));

  const hits = [];
  registry.registerRemoteRenderCallback("renderCompanyAdminDashboard", () => hits.push("ca-dash"));
  registry.registerRemoteRenderCallback("renderCompanyAdminDrivers", () => hits.push("ca-drv"));
  registry.registerRemoteRenderCallback("renderDispatcherDashboard", () => hits.push("dispo"));
  registry.registerRemoteRenderCallback("renderDriverDashboard", () => hits.push("driver"));

  handleRemoteCollectionUpdate("drivers");
  assert.deepEqual(hits, ["ca-dash"]);

  hits.length = 0;
  active = drivers;
  handleRemoteCollectionUpdate("drivers");
  assert.deepEqual(hits, ["ca-drv"]);

  hits.length = 0;
  window.currentUser = { role: "dispatcher" };
  active = { id: "dispatcher-dashboard", classList: { contains: () => false } };
  handleRemoteCollectionUpdate("drivers");
  assert.deepEqual(hits, ["dispo"]);

  hits.length = 0;
  registry.registerRemoteRenderCallback("renderDispatcherReports", () => hits.push("reports"));
  active = { id: "dispatcher-reports", classList: { contains: () => false } };
  handleRemoteCollectionUpdate("reports");
  assert.deepEqual(hits, ["reports"]);

  hits.length = 0;
  window.currentUser = { role: "driver" };
  handleRemoteCollectionUpdate("shifts");
  assert.deepEqual(hits, ["driver"]);

  hits.length = 0;
  window.currentUser = { role: "company-admin" };
  active = dashboard;
  handleRemoteCollectionUpdate("messages");
  assert.deepEqual(hits, [], "role/section mismatch must not invoke another surface");

  registry.resetRemoteRenderRegistryForTests();
});

function pathToFileUrl(filePath) {
  const resolved = path.resolve(filePath).replace(/\\/g, "/");
  return resolved.startsWith("/") ? `file://${resolved}` : `file:///${resolved}`;
}
