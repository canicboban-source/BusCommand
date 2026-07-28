const ALLOWED_PROJECT_ID = "buscommand-preview";
const CREDENTIAL_FIELDS = Object.freeze([
  "eid", "companyCodeHash", "loginCodeHash", "temporaryCodeHash", "temporaryHash",
  "company_code", "companyCode", "pin", "password", "passwordHash"
]);

function assertMigrationTarget(projectId, companyId) {
  if (projectId !== ALLOWED_PROJECT_ID) throw new Error("Migration target project is not allowed.");
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(companyId || ""))) throw new Error("Explicit company ID is required.");
}

function buildMigrationPlan(profile = {}) {
  const present = CREDENTIAL_FIELDS.filter((field) => profile[field] != null);
  if (!present.length) return null;
  const credentials = {};
  for (const field of ["eid", "companyCodeHash", "loginCodeHash", "temporaryCodeHash"]) {
    if (profile[field] != null) credentials[field] = profile[field];
  }
  if (profile.createdAt != null) credentials.createdAt = profile.createdAt;
  return { credentials, removeFields: present };
}

async function migrateCompany({ db, fieldValue, projectId, companyId, dryRun = true, logger = () => {} }) {
  assertMigrationTarget(projectId, companyId);
  const companyRef = db.collection("companies").doc(companyId);
  const snapshot = await companyRef.collection("drivers").get();
  let candidates = 0;
  let migrated = 0;
  for (const profileDoc of snapshot.docs) {
    const plan = buildMigrationPlan(profileDoc.data());
    if (!plan) continue;
    candidates += 1;
    if (dryRun) continue;
    const credentialRef = companyRef.collection("driver_credentials").doc(profileDoc.id);
    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(profileDoc.ref);
      const latestPlan = latest.exists ? buildMigrationPlan(latest.data()) : null;
      if (!latestPlan) return;
      transaction.set(credentialRef, latestPlan.credentials, { merge: true });
      const removals = {};
      latestPlan.removeFields.forEach((field) => { removals[field] = fieldValue.delete(); });
      transaction.update(profileDoc.ref, removals);
      migrated += 1;
    });
  }
  logger({ event: "driver_credential_migration_summary", companyId, dryRun, candidates, migrated });
  return { dryRun, candidates, migrated };
}

module.exports = { ALLOWED_PROJECT_ID, CREDENTIAL_FIELDS, assertMigrationTarget, buildMigrationPlan, migrateCompany };
