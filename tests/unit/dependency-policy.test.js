const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lockfile = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

function compareVersions(a, b) {
  const left = a.split("-")[0].split(".").map(Number);
  const right = b.split("-")[0].split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0);
  }
  return 0;
}

test("uuid is pinned above the advisory range for every transitive dependent", () => {
  assert.equal(manifest.overrides?.uuid, "^11.1.1");

  const installed = Object.entries(lockfile.packages || {})
    .filter(([location]) => location.endsWith("node_modules/uuid"))
    .map(([location, entry]) => ({ location, version: entry.version }));

  assert.ok(installed.length > 0, "lockfile must resolve uuid at least once");
  for (const { location, version } of installed) {
    assert.ok(
      compareVersions(version, "11.1.1") >= 0,
      `${location} resolves uuid ${version}, below the patched 11.1.1 (GHSA-w5hq-g745-h8pq)`
    );
  }
});

test("firebase-admin stays on the namespaced major that the server code targets", () => {
  // firebase-admin 14 removed the legacy namespace at runtime: admin.auth,
  // admin.firestore, admin.credential and admin.apps no longer exist. Every
  // server module and script here uses that namespace, so a major bump requires
  // a full migration to the modular entry points, not a version change.
  assert.equal(manifest.dependencies["firebase-admin"], "^12.0.0");
  assert.equal(manifest.engines.node, "22.x");
});

test("server source uses the namespaced Admin SDK surface consistently", () => {
  const apiServer = fs.readFileSync(path.join(root, "api-server.js"), "utf8");
  assert.match(apiServer, /admin\.credential\.cert/);
  assert.match(apiServer, /admin\.firestore\(\)/);
  assert.match(apiServer, /admin\.firestore\.FieldValue\.serverTimestamp/);
});
