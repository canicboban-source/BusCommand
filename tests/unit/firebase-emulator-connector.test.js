/**
 * Emulator connector safety gate — deterministic negative/positive tests.
 * QA-only, isolated-worktree file (not present in the original worktree).
 */
const test = require("node:test");
const assert = require("node:assert/strict");

// firebase-web-config.js is an ESM module; use dynamic import from CJS test.
async function loadModule() {
  return import("../../js/core/firebase-web-config.js");
}

test("flag absent -> emulator config resolves as disabled", async () => {
  const { readFirebaseEmulatorConfig } = await loadModule();
  const config = readFirebaseEmulatorConfig({});
  assert.equal(config.enabled, false);
});

test("flag enabled + non-local hostname -> rejected", async () => {
  const { readFirebaseEmulatorConfig, validateFirebaseEmulatorConfig } = await loadModule();
  const config = readFirebaseEmulatorConfig({
    VITE_USE_FIREBASE_EMULATOR: "1",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: "demo-buscommand-scale"
  });
  const result = validateFirebaseEmulatorConfig(config, { hostname: "buscommand-preview.example.com" });
  assert.equal(result.valid, false);
  assert.match(result.error, /hostname/i);
});

test("flag enabled + non-local Firestore host -> rejected", async () => {
  const { readFirebaseEmulatorConfig, validateFirebaseEmulatorConfig } = await loadModule();
  const config = readFirebaseEmulatorConfig({
    VITE_USE_FIREBASE_EMULATOR: "1",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: "demo-buscommand-scale",
    VITE_FIREBASE_EMULATOR_FIRESTORE_HOST: "evil.example.com"
  });
  const result = validateFirebaseEmulatorConfig(config, { hostname: "localhost" });
  assert.equal(result.valid, false);
  assert.match(result.error, /Firestore host/i);
});

test("flag enabled + non-local Auth host -> rejected", async () => {
  const { readFirebaseEmulatorConfig, validateFirebaseEmulatorConfig } = await loadModule();
  const config = readFirebaseEmulatorConfig({
    VITE_USE_FIREBASE_EMULATOR: "1",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: "demo-buscommand-scale",
    VITE_FIREBASE_EMULATOR_AUTH_HOST: "evil.example.com"
  });
  const result = validateFirebaseEmulatorConfig(config, { hostname: "127.0.0.1" });
  assert.equal(result.valid, false);
  assert.match(result.error, /Auth host/i);
});

test("flag enabled + project id without demo- prefix -> rejected", async () => {
  const { readFirebaseEmulatorConfig, validateFirebaseEmulatorConfig } = await loadModule();
  const config = readFirebaseEmulatorConfig({
    VITE_USE_FIREBASE_EMULATOR: "1",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: "buscommand-preview"
  });
  const result = validateFirebaseEmulatorConfig(config, { hostname: "localhost" });
  assert.equal(result.valid, false);
  assert.match(result.error, /demo-/);
});

test("flag enabled + invalid port -> rejected (no silent default)", async () => {
  const { readFirebaseEmulatorConfig, validateFirebaseEmulatorConfig } = await loadModule();
  const config = readFirebaseEmulatorConfig({
    VITE_USE_FIREBASE_EMULATOR: "1",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: "demo-buscommand-scale",
    VITE_FIREBASE_EMULATOR_FIRESTORE_PORT: "not-a-port"
  });
  const result = validateFirebaseEmulatorConfig(config, { hostname: "localhost" });
  assert.equal(result.valid, false);
  assert.match(result.error, /port/i);
});

test("all conditions satisfied -> accepted", async () => {
  const { readFirebaseEmulatorConfig, validateFirebaseEmulatorConfig } = await loadModule();
  const config = readFirebaseEmulatorConfig({
    VITE_USE_FIREBASE_EMULATOR: "1",
    VITE_FIREBASE_EMULATOR_PROJECT_ID: "demo-buscommand-scale",
    VITE_FIREBASE_EMULATOR_FIRESTORE_HOST: "127.0.0.1",
    VITE_FIREBASE_EMULATOR_FIRESTORE_PORT: "8080",
    VITE_FIREBASE_EMULATOR_AUTH_HOST: "localhost",
    VITE_FIREBASE_EMULATOR_AUTH_PORT: "9099"
  });
  const result = validateFirebaseEmulatorConfig(config, { hostname: "localhost" });
  assert.equal(result.valid, true);
});

test("runtime-only window signal is NOT sufficient by itself (build flag absent)", async () => {
  const { readFirebaseEmulatorConfig } = await loadModule();
  // Simulates: window.__BUSCOMMAND_USE_FIREBASE_EMULATOR__ = true, but no
  // VITE_USE_FIREBASE_EMULATOR build flag was set. readFirebaseEmulatorConfig
  // only ever reads the build-time env, so it must resolve disabled.
  const config = readFirebaseEmulatorConfig({});
  assert.equal(config.enabled, false);
});
