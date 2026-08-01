#!/usr/bin/env node
/**
 * Permanently delete ALL companies (Firestore tree + Auth users tied to them).
 * Superadmin Auth accounts (no companyId) are kept.
 *
 * Usage:
 *   node scripts/purge-all-companies.js --yes
 *   node scripts/purge-all-companies.js --yes --keep bc-test
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const SERVICE_ACCOUNT_PATH = path.join(ROOT, "firebase-admin-key.json");

function parseArgs(argv) {
  const keep = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--keep" && argv[i + 1]) {
      keep.add(String(argv[i + 1]).trim());
      i += 1;
    }
  }
  return { yes: argv.includes("--yes"), keep };
}

function ensureAdmin() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error("Nedostaje firebase-admin-key.json");
    process.exit(1);
  }
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
  }
  return admin;
}

async function main() {
  const { yes, keep } = parseArgs(process.argv.slice(2));
  if (!yes) {
    console.error("Refusing to purge without --yes");
    console.error("Example: node scripts/purge-all-companies.js --yes");
    process.exit(1);
  }

  const admin = ensureAdmin();
  const db = admin.firestore();
  const { deleteCompanyAtomic } = require("../server/provisioning");

  const snap = await db.collection("companies").get();
  const targets = snap.docs.map((doc) => doc.id).filter((id) => !keep.has(id));

  console.log(`\nPurging ${targets.length} compan(y/ies)...`);
  if (keep.size) console.log("Keeping:", [...keep].join(", "));

  for (const companyId of targets) {
    process.stdout.write(`  deleting ${companyId}... `);
    const result = await deleteCompanyAtomic({
      db,
      admin,
      companyId,
      confirmCompanyId: companyId,
      actorId: "purge-all-companies"
    });
    console.log(`ok (auth users: ${result.deletedAuthUsers})`);
  }

  console.log("\nDone. SA panel should show empty companies list after hard refresh.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
