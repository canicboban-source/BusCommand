"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");

test("render.staging.yaml isolates identity without assumed onrender URL", () => {
  const yaml = fs.readFileSync(path.join(ROOT, "render.staging.yaml"), "utf8");
  assert.match(yaml, /name:\s*buscommand-preview-staging/);
  assert.match(yaml, /branch:\s*staging\/phase-3-isolation/);
  assert.match(yaml, /autoDeployTrigger:\s*"off"/);
  assert.match(yaml, /key:\s*NODE_VERSION[\s\S]*?value:\s*"22\.14\.0"/);
  assert.match(yaml, /key:\s*CORS_ORIGINS[\s\S]*?sync:\s*false/);
  assert.match(yaml, /key:\s*APP_PUBLIC_URL[\s\S]*?sync:\s*false/);
  assert.match(yaml, /BUSCOMMAND_ENV/);
  assert.match(yaml, /healthCheckPath:\s*\/api\/health/);
  assert.doesNotMatch(yaml, /buscommand\.com/);
  assert.doesNotMatch(yaml, /buscommand-preview\.onrender\.com/);
  assert.doesNotMatch(yaml, /type:\s*cron/);
  assert.doesNotMatch(yaml, /CONFIRMATION_DISPATCH_URL/);
  assert.doesNotMatch(yaml, /value:\s*AIza/);
  assert.doesNotMatch(yaml, /value:\s*https:\/\//);
});

test("staging firebase alias and deploy helper require explicit buscommand-preview", () => {
  const rc = JSON.parse(fs.readFileSync(path.join(ROOT, ".firebaserc"), "utf8"));
  assert.equal(rc.projects.default, "buscommand-preview");
  assert.equal(rc.projects.staging, "buscommand-preview");
  const helper = fs.readFileSync(path.join(ROOT, "scripts/staging-firestore-deploy.NOT_EXECUTED.sh"), "utf8");
  assert.match(helper, /--project \$\{PROJECT_ID\}/);
  assert.match(helper, /buscommand-preview/);
  assert.match(helper, /NOT EXECUTED/);
  assert.match(helper, /Forbidden:/);
  assert.match(helper, /mutates active project selection/);
  assert.doesNotMatch(helper, /^\s*firebase use\b/m);
});

test("confirmation dispatch script has no hardcoded host fallback", () => {
  const src = fs.readFileSync(path.join(ROOT, "scripts/run-confirmation-dispatch.js"), "utf8");
  assert.doesNotMatch(src, /https:\/\/buscommand\.com/);
  assert.doesNotMatch(src, / \|\| "https:\/\//);
  assert.match(src, /CONFIRMATION_DISPATCH_URL missing/);
  assert.match(src, /BUSCOMMAND_ENV=staging/);
});

test("api-server uses runtime-isolation fail-fast and liveness health", () => {
  const src = fs.readFileSync(path.join(ROOT, "api-server.js"), "utf8");
  assert.match(src, /require\("\.\/server\/runtime-isolation"\)/);
  assert.match(src, /validateRuntimeBeforeListen/);
  assert.match(src, /require\("\.\/server\/cors-policy"\)/);
  assert.doesNotMatch(src, /function isBusCommandCorsOrigin/);
  assert.doesNotMatch(src, /https:\/\/buscommand\.com/);
  assert.doesNotMatch(src, /buscommand-preview\.onrender\.com/);
  assert.match(src, /res\.status\(200\)\.json\(\{\s*ok:\s*true\s*\}\)/);
});

test("browser firebase config remains pinned to buscommand-preview", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/core/firebase-web-config.js"), "utf8");
  assert.match(src, /EXPECTED_FIREBASE_PROJECT_ID = "buscommand-preview"/);
});

test("env example has empty APP_PUBLIC_URL and no assumed staging onrender URL", () => {
  const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.match(envExample, /^APP_PUBLIC_URL=\s*$/m);
  assert.doesNotMatch(envExample, /^APP_PUBLIC_URL=https:\/\/www\.buscommand\.com/m);
  assert.doesNotMatch(envExample, /buscommand-preview\.onrender\.com/);
});
