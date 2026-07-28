#!/usr/bin/env node
const admin = require("firebase-admin");
const { migrateCompany, ALLOWED_PROJECT_ID } = require("../server/driver-credential-migration");

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const projectId = option("project");
  const companyId = option("company");
  const apply = process.argv.includes("--apply");
  if (!projectId || !companyId) throw new Error("Use explicit --project and --company arguments.");
  if (projectId !== ALLOWED_PROJECT_ID) throw new Error("Refusing migration outside buscommand-preview.");
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  const activeProjectId = admin.app().options.projectId;
  if (activeProjectId !== projectId) throw new Error("Active Firebase project does not match the explicit project.");
  const result = await migrateCompany({
    db: admin.firestore(), fieldValue: admin.firestore.FieldValue,
    projectId, companyId, dryRun: !apply,
    logger: (entry) => console.log(JSON.stringify(entry))
  });
  console.log(JSON.stringify({ success: true, dryRun: result.dryRun, candidates: result.candidates, migrated: result.migrated }));
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
