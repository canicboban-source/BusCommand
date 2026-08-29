#!/usr/bin/env node
"use strict";

const admin = require("firebase-admin");
const { scanAndBackfillDutyGuards } = require("../server/duty-instance-backfill");

function parseAndValidateBackfillArgs(argv = []) {
  const getArg = (flag) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
  };

  const companyId = getArg("--company");
  const startDate = getArg("--from");
  const endDate = getArg("--to");
  const project = getArg("--project");
  const confirmProject = getArg("--confirm-project");
  const apply = argv.includes("--apply");

  if (!companyId) {
    throw new Error("SAFETY ERROR: --company <companyId> is required.");
  }

  if (apply) {
    if (!project || !confirmProject) {
      throw new Error("SAFETY ERROR: --apply requires explicit --project <projectId> AND --confirm-project <projectId>.");
    }
    if (project !== confirmProject) {
      throw new Error(`SAFETY ERROR: --project ('${project}') and --confirm-project ('${confirmProject}') do not match.`);
    }
  }

  return {
    companyId,
    startDate,
    endDate,
    project,
    confirmProject,
    apply,
    dryRun: !apply
  };
}

async function main() {
  const args = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseAndValidateBackfillArgs(args);
  } catch (err) {
    console.error(err.message);
    console.error("Usage:");
    console.error("  DRY-RUN (default): node scripts/backfill-duty-guards.js --company <companyId> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--project <projectId>]");
    console.error("  APPLY:             node scripts/backfill-duty-guards.js --company <companyId> --apply --project <projectId> --confirm-project <projectId> [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
    process.exit(1);
  }

  const { companyId, startDate, endDate, project, apply, dryRun } = parsed;
  const effectiveProject = project || process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT || "buscommand-preview";

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: effectiveProject });
  }

  const db = admin.firestore();

  console.log(`=== DUTY GUARD BACKFILL ===`);
  console.log(`Target Project: ${effectiveProject}`);
  console.log(`Target Company: ${companyId}`);
  console.log(`Execution Mode: ${apply ? "APPLY (WRITING CLEAN GUARDS ONLY)" : "DRY-RUN (READ-ONLY PREVIEW)"}`);
  if (startDate || endDate) {
    console.log(`Date Range:     ${startDate || "start"} -> ${endDate || "end"}`);
  }
  console.log(`===========================`);

  const result = await scanAndBackfillDutyGuards({
    db,
    admin,
    companyId,
    startDate,
    endDate,
    dryRun: !apply
  });

  console.log(JSON.stringify({
    companyId: result.companyId,
    dryRun: result.dryRun,
    startDate: result.startDate,
    endDate: result.endDate,
    totalShiftsScanned: result.totalShiftsScanned,
    operationalDutyInstances: result.operationalDutyInstances,
    cleanGuardsCount: result.cleanGuardsCount,
    conflictsCount: result.conflictsCount,
    guardsWritten: result.guardsWritten,
    conflicts: result.conflicts
  }, null, 2));

  if (result.conflictsCount > 0) {
    console.warn(`\nWARNING: Found ${result.conflictsCount} conflicting duty instances. Conflicting guards were SKIPPED and NOT written. These require dispatcher resolution.`);
  } else {
    console.log(`\nSuccess: All ${result.cleanGuardsCount} active duty instances are clean.`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
}

module.exports = { main, parseAndValidateBackfillArgs };
