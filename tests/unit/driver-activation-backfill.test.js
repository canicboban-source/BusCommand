"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
  ACTIVATION_CLASS,
  classifyDriverActivation,
  migrateCompanyDriverActivation,
  parseActivationBackfillArgs,
  prepareActivationBackfillRun,
  resolveCredentialProjectId,
  safeLogEntry
} = require("../../server/driver-activation-backfill");
const { main: runActivationMigrationCli } = require("../../scripts/migrate-driver-activation");

const SCRIPT_PATH = path.join(__dirname, "..", "..", "scripts", "migrate-driver-activation.js");
const MATCHED_PROJECT = "buscommand-preview";
const OTHER_PROJECT = "other-firebase-project";
const SECRET_MARKER = "DO-NOT-LEAK-CREDENTIAL";

function fakeDb(initial = {}) {
  const store = new Map(Object.entries(initial));
  const ref = (path) => ({
    path,
    id: path.split("/").pop(),
    collection(name) { return collection(`${path}/${name}`); },
    doc(id) { return ref(`${path}/${id}`); },
    async get() {
      const value = store.get(path);
      return {
        exists: Boolean(value),
        id: path.split("/").pop(),
        ref: ref(path),
        data: () => ({ ...(value || {}) })
      };
    },
    async update(data) {
      store.set(path, { ...(store.get(path) || {}), ...data });
    }
  });
  const collection = (path) => ({
    doc(id) { return ref(`${path}/${id}`); },
    async get() {
      const prefix = `${path}/`;
      const docs = [...store.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .map(([key, value]) => ({
          id: key.slice(prefix.length),
          ref: ref(key),
          exists: true,
          data: () => ({ ...value })
        }));
      return { docs };
    }
  });
  return {
    store,
    collection(name) { return collection(name); }
  };
}

test("classifies proven activated, proven pending, and ambiguous profiles", () => {
  assert.equal(classifyDriverActivation({ codeActivated: true }, {}).class, ACTIVATION_CLASS.ACTIVATED);
  assert.equal(classifyDriverActivation({ codeActivated: true }, {}).write, false);

  const activated = classifyDriverActivation(
    { codeActivated: false, pin: "9999", eid: "EID-SECRET" },
    { loginCodeHash: "hash-login", activationUsedAt: "2026-01-01T00:00:00Z" }
  );
  assert.equal(activated.class, ACTIVATION_CLASS.ACTIVATED);
  assert.equal(activated.proposed, true);
  assert.equal(activated.write, true);

  const pending = classifyDriverActivation(
    {},
    { activationCodeHash: "hash-otp" }
  );
  assert.equal(pending.class, ACTIVATION_CLASS.PENDING);
  assert.equal(pending.proposed, false);
  assert.equal(pending.write, true);

  const alreadyFalse = classifyDriverActivation({ codeActivated: false }, {});
  assert.equal(alreadyFalse.class, ACTIVATION_CLASS.PENDING);
  assert.equal(alreadyFalse.write, false);

  const ambiguous = classifyDriverActivation({}, {});
  assert.equal(ambiguous.class, ACTIVATION_CLASS.REVIEW_REQUIRED);
  assert.equal(ambiguous.write, false);
  assert.equal(ambiguous.proposed, null);
});

test("dry-run writes nothing; apply skips ambiguous; second pass is idempotent; logs have no secrets", async () => {
  const db = fakeDb({
    "companies/alpha/drivers/drv-activated": { codeActivated: false, eid: "EID-SECRET", pin: "9999" },
    "companies/alpha/driver_credentials/drv-activated": {
      loginCodeHash: "hash-login",
      activationUsedAt: "2026-01-01T00:00:00Z",
      activationCodeHash: "hash-otp"
    },
    "companies/alpha/drivers/drv-pending": { name: "Pending" },
    "companies/alpha/driver_credentials/drv-pending": { activationCodeHash: "otp-hash" },
    "companies/alpha/drivers/drv-ambiguous": { phone: "+431234" },
    "companies/alpha/drivers/drv-already": { codeActivated: true }
  });
  const logs = [];
  const logger = (entry) => logs.push(JSON.stringify(entry));
  const dry = await migrateCompanyDriverActivation({ db, companyId: "alpha", dryRun: true, logger });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.written, 0);
  assert.equal(db.store.get("companies/alpha/drivers/drv-activated").codeActivated, false);
  assert.equal(db.store.get("companies/alpha/drivers/drv-pending").codeActivated, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(db.store.get("companies/alpha/drivers/drv-ambiguous"), "codeActivated"), false);

  const applied = await migrateCompanyDriverActivation({ db, companyId: "alpha", dryRun: false, logger });
  assert.equal(applied.written, 2);
  assert.equal(applied.reviewRequired, 1);
  assert.equal(db.store.get("companies/alpha/drivers/drv-activated").codeActivated, true);
  assert.equal(db.store.get("companies/alpha/drivers/drv-pending").codeActivated, false);
  assert.equal(Object.prototype.hasOwnProperty.call(db.store.get("companies/alpha/drivers/drv-ambiguous"), "codeActivated"), false);
  assert.equal(db.store.get("companies/alpha/drivers/drv-already").codeActivated, true);

  const again = await migrateCompanyDriverActivation({ db, companyId: "alpha", dryRun: false, logger });
  assert.equal(again.written, 0);
  assert.equal(db.store.get("companies/alpha/drivers/drv-ambiguous").codeActivated, undefined);

  const blob = logs.join("\n");
  assert.doesNotMatch(blob, /EID-SECRET|9999|hash-login|hash-otp|otp-hash|\+431234/i);
  const sample = safeLogEntry({
    companyId: "alpha",
    driverId: "drv-activated",
    classification: classifyDriverActivation(
      { codeActivated: false },
      { loginCodeHash: "hash-login", activationUsedAt: "2026-01-01T00:00:00Z" }
    ),
    dryRun: true
  });
  assert.deepEqual(Object.keys(sample).sort(), [
    "class", "companyId", "driverId", "dryRun", "event", "proposed", "reason", "write"
  ].sort());
});

test("parse args require company and matching project identity for dry-run and apply", () => {
  assert.throws(() => parseActivationBackfillArgs([]), /exactly one tenant/);
  assert.throws(() => parseActivationBackfillArgs(["--company", "alpha"]), /--project and --confirm-project are required/);
  assert.throws(() => parseActivationBackfillArgs([
    "--company", "alpha", "--project", MATCHED_PROJECT
  ]), /--project and --confirm-project are required/);
  assert.throws(() => parseActivationBackfillArgs([
    "--company", "alpha", "--confirm-project", MATCHED_PROJECT
  ]), /--project and --confirm-project are required/);
  assert.throws(() => parseActivationBackfillArgs([
    "--company", "alpha", "--apply"
  ]), /--project and --confirm-project are required/);
  assert.throws(() => parseActivationBackfillArgs([
    "--company", "alpha", "--apply", "--project", "proj-a", "--confirm-project", "proj-b"
  ]), /do not match/);
  const dry = parseActivationBackfillArgs([
    "--company", "alpha", "--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT
  ]);
  assert.equal(dry.dryRun, true);
  assert.equal(dry.apply, false);
  const apply = parseActivationBackfillArgs([
    "--company", "alpha", "--apply", "--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT
  ]);
  assert.equal(apply.dryRun, false);
  assert.equal(apply.apply, true);
});

test("rejects wildcard, global, path, empty, and multi-company scope", () => {
  const required = ["--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT];
  const forbidden = ["*", "all", "ALL", "global", "/", " ", "", "alpha/beta", "alpha\\beta", "..", "../x", "alpha,beta"];
  for (const company of forbidden) {
    assert.throws(
      () => parseActivationBackfillArgs(["--company", company, ...required]),
      /exactly one tenant/
    );
  }
  assert.throws(
    () => parseActivationBackfillArgs(["--company", "alpha", "--company", "beta", ...required]),
    /exactly one tenant/
  );
});

function secretEnv(projectId) {
  return {
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account",
      project_id: projectId,
      secret_marker: SECRET_MARKER,
      token_uri: "https://example.test/token"
    })
  };
}

async function runCli(argv, env, extras = {}) {
  let initCalls = 0;
  const logs = [];
  const result = await runActivationMigrationCli({
    argv,
    env,
    initializeApp: (opts) => {
      initCalls += 1;
      if (typeof extras.onInit === "function") extras.onInit(opts);
      return extras.firebaseHandle || { firestore: () => extras.db };
    },
    getFirestore: extras.db ? () => extras.db : undefined,
    readFile: extras.readFile,
    stdout: (line) => logs.push(String(line)),
    stderr: (line) => logs.push(String(line)),
    setExitCode: () => {}
  });
  return { result, initCalls, logs: logs.join("\n") };
}

test("CLI dry-run identity failures never call Firebase init and never leak credentials", async () => {
  const env = secretEnv(MATCHED_PROJECT);

  const missingProject = await runCli(
    ["--company", "alpha", "--confirm-project", MATCHED_PROJECT],
    env
  );
  assert.equal(missingProject.result.exitCode, 1);
  assert.equal(missingProject.initCalls, 0);
  assert.match(missingProject.logs, /--project and --confirm-project are required/);
  assert.doesNotMatch(missingProject.logs, new RegExp(SECRET_MARKER));

  const missingConfirm = await runCli(
    ["--company", "alpha", "--project", MATCHED_PROJECT],
    env
  );
  assert.equal(missingConfirm.result.exitCode, 1);
  assert.equal(missingConfirm.initCalls, 0);
  assert.match(missingConfirm.logs, /--project and --confirm-project are required/);
  assert.doesNotMatch(missingConfirm.logs, new RegExp(SECRET_MARKER));

  const mismatch = await runCli(
    ["--company", "alpha", "--project", MATCHED_PROJECT, "--confirm-project", OTHER_PROJECT],
    env
  );
  assert.equal(mismatch.result.exitCode, 1);
  assert.equal(mismatch.initCalls, 0);
  assert.match(mismatch.logs, /do not match/);
  assert.doesNotMatch(mismatch.logs, new RegExp(SECRET_MARKER));

  const credentialMismatch = await runCli(
    ["--company", "alpha", "--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT],
    secretEnv(OTHER_PROJECT)
  );
  assert.equal(credentialMismatch.result.exitCode, 1);
  assert.equal(credentialMismatch.initCalls, 0);
  assert.match(credentialMismatch.logs, /credential project does not match/);
  assert.doesNotMatch(credentialMismatch.logs, new RegExp(SECRET_MARKER));

  const applyMismatch = await runCli(
    ["--company", "alpha", "--apply", "--project", "proj-a", "--confirm-project", "proj-b"],
    env
  );
  assert.equal(applyMismatch.result.exitCode, 1);
  assert.equal(applyMismatch.initCalls, 0);
  assert.match(applyMismatch.logs, /do not match/);

  const wildcard = await runCli(
    ["--company", "*", "--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT],
    env
  );
  assert.equal(wildcard.initCalls, 0);
  assert.match(wildcard.logs, /exactly one tenant/);
});

test("valid dry-run allows reads, writes nothing, and only inits after identity matches", async () => {
  const db = fakeDb({
    "companies/alpha/drivers/drv-activated": { codeActivated: false },
    "companies/alpha/driver_credentials/drv-activated": {
      loginCodeHash: "hash-login",
      activationUsedAt: "2026-01-01T00:00:00Z"
    }
  });
  const ran = await runCli(
    ["--company", "alpha", "--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT],
    { GCLOUD_PROJECT: MATCHED_PROJECT },
    { db }
  );
  assert.equal(ran.initCalls, 1);
  assert.equal(ran.result.ok, true);
  assert.equal(ran.result.result.dryRun, true);
  assert.equal(ran.result.result.written, 0);
  assert.equal(db.store.get("companies/alpha/drivers/drv-activated").codeActivated, false);
  assert.doesNotMatch(ran.logs, /hash-login|GCLOUD_PROJECT|secret_marker/i);
});

test("prepareActivationBackfillRun resolves credential project without exposing file contents", () => {
  const prepared = prepareActivationBackfillRun({
    argv: ["--company", "alpha", "--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT],
    env: { GOOGLE_APPLICATION_CREDENTIALS: "C:/outside/repo/sa.json" },
    readFile: () => JSON.stringify({
      project_id: MATCHED_PROJECT,
      secret_marker: SECRET_MARKER
    })
  });
  assert.equal(prepared.credentialProjectId, MATCHED_PROJECT);
  assert.equal(prepared.dryRun, true);
  assert.throws(() => prepareActivationBackfillRun({
    argv: ["--company", "alpha", "--project", MATCHED_PROJECT, "--confirm-project", MATCHED_PROJECT],
    env: { GOOGLE_APPLICATION_CREDENTIALS: "C:/outside/repo/sa.json" },
    readFile: () => JSON.stringify({
      project_id: OTHER_PROJECT,
      secret_marker: SECRET_MARKER
    })
  }), /credential project does not match/);
  try {
    resolveCredentialProjectId(
      { FIREBASE_SERVICE_ACCOUNT_JSON: "{not-json " + SECRET_MARKER },
    );
    assert.fail("expected resolve to throw");
  } catch (err) {
    assert.match(err.message, /credential project could not be resolved/);
    assert.doesNotMatch(err.message, new RegExp(SECRET_MARKER));
  }
});

test("spawned CLI mismatch exits non-zero before Firebase init and hides credential material", () => {
  const env = {
    ...process.env,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account",
      project_id: OTHER_PROJECT,
      secret_marker: SECRET_MARKER
    }),
    GOOGLE_APPLICATION_CREDENTIALS: "",
    GCLOUD_PROJECT: "",
    GOOGLE_CLOUD_PROJECT: ""
  };
  const missing = spawnSync(process.execPath, [SCRIPT_PATH, "--company", "alpha"], {
    encoding: "utf8",
    env
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--project and --confirm-project are required/);
  assert.doesNotMatch(`${missing.stdout}${missing.stderr}`, new RegExp(SECRET_MARKER));

  const mismatch = spawnSync(process.execPath, [
    SCRIPT_PATH,
    "--company", "alpha",
    "--project", MATCHED_PROJECT,
    "--confirm-project", MATCHED_PROJECT
  ], { encoding: "utf8", env });
  assert.notEqual(mismatch.status, 0);
  assert.match(mismatch.stderr, /credential project does not match/);
  assert.doesNotMatch(`${mismatch.stdout}${mismatch.stderr}`, new RegExp(SECRET_MARKER));
});
