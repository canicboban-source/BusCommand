#!/usr/bin/env node
"use strict";

const {
  migrateCompanyDriverActivation,
  prepareActivationBackfillRun
} = require("../server/driver-activation-backfill");

const USAGE = [
  "Usage:",
  "  DRY-RUN (default): node scripts/migrate-driver-activation.js --company <companyId> --project <projectId> --confirm-project <projectId>",
  "  APPLY:             node scripts/migrate-driver-activation.js --company <companyId> --apply --project <projectId> --confirm-project <projectId>"
].join("\n");

function defaultInitializeApp({ projectId }) {
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({ projectId });
  }
  const activeProjectId = admin.app().options.projectId;
  if (activeProjectId !== projectId) {
    throw new Error("SAFETY ERROR: active Firebase project does not match --confirm-project.");
  }
  return admin;
}

function writeLine(writer, line) {
  if (typeof writer === "function") {
    writer(line);
    return;
  }
  console.error(line);
}

async function main(deps = {}) {
  const argv = Array.isArray(deps.argv) ? deps.argv : process.argv.slice(2);
  const env = deps.env || process.env;
  const stderr = typeof deps.stderr === "function" ? deps.stderr : (line) => console.error(line);
  const stdout = typeof deps.stdout === "function" ? deps.stdout : (line) => console.log(line);
  const setExitCode = typeof deps.setExitCode === "function"
    ? deps.setExitCode
    : (code) => { process.exitCode = code; };

  let prepared;
  try {
    prepared = prepareActivationBackfillRun({
      argv,
      env,
      readFile: deps.readFile
    });
  } catch (err) {
    stderr(err && err.message ? err.message : "SAFETY ERROR: identity check failed.");
    stderr(USAGE);
    setExitCode(1);
    return { ok: false, exitCode: 1 };
  }

  const initializeApp = typeof deps.initializeApp === "function"
    ? deps.initializeApp
    : defaultInitializeApp;
  let firebaseHandle;
  try {
    firebaseHandle = initializeApp({ projectId: prepared.project });
  } catch (err) {
    stderr(err && err.message ? err.message : "SAFETY ERROR: Firebase initialization failed.");
    setExitCode(1);
    return { ok: false, exitCode: 1 };
  }

  const db = typeof deps.getFirestore === "function"
    ? deps.getFirestore(firebaseHandle)
    : firebaseHandle.firestore();

  const result = await migrateCompanyDriverActivation({
    db,
    companyId: prepared.companyId,
    dryRun: prepared.dryRun,
    logger: (entry) => stdout(JSON.stringify(entry))
  });
  stdout(JSON.stringify({
    success: true,
    dryRun: result.dryRun,
    scanned: result.scanned,
    written: result.written,
    reviewRequired: result.reviewRequired
  }));
  return { ok: true, exitCode: 0, result };
}

if (require.main === module) {
  main().catch((error) => {
    writeLine(console.error, error && error.message ? error.message : "Migration failed.");
    process.exitCode = 1;
  });
}

module.exports = { main, defaultInitializeApp, USAGE };
