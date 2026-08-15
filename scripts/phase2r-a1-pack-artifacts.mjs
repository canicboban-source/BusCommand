/**
 * Pack FAZA 2R-A.1 review-source ZIP with preserved repo paths (/ separators)
 * and SHA-256 manifest. This is a review-only package, not a full-repo deliverable.
 */
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports");
const baseSha = "a6fbcb508c67287c33479f38c3678cd44684ee60";

const reviewFiles = [
  "server/staff-monthly-plan-import.js",
  "server/group-monthly-plan-import.js",
  "server/driver-routes.js",
  "js/dispatcher/plan-import.js",
  "js/core/api-client.js",
  "translations.js",
  "tests/unit/phase2r-a1-reliability-closeout.test.js",
  "tests/unit/phase2r-a1-http.test.js",
  "tests/unit/staff-monthly-plan-import.test.js",
  "tests/e2e/dispo-monthly-import-server.spec.js",
  "scripts/phase2r-a1-visual-trail.mjs",
  "reports/phase-2r-a1-report-2026-08-09.md",
  "reports/phase-2r-a1-change-ledger.md"
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const manifestPath = join(reports, "phase-2r-a1-source-manifest.txt");
const lines = [
  "PHASE 2R-A.1 - REVIEW-SOURCE MANIFEST",
  "date: 2026-08-09",
  "package-type: review-only (NOT a full-repo deliverable)",
  "purpose: reliability closeout correction (STOP - no commit/push/deploy)",
  "",
  "base SHA:",
  baseSha,
  "",
  "SHA-256 of review-source files:"
];
for (const rel of reviewFiles) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    lines.push(`MISSING  ${rel}`);
    continue;
  }
  lines.push(`${sha256(abs)}  ${statSync(abs).size}  ${rel}`);
}
writeFileSync(manifestPath, `${lines.join("\n")}\n`);

const staging = join(reports, "_phase2r-a1-review-staging");
spawnSync("powershell", ["-NoProfile", "-Command",
  `if (Test-Path '${staging.replace(/'/g, "''")}') { Remove-Item -Recurse -Force '${staging.replace(/'/g, "''")}' }; New-Item -ItemType Directory -Force -Path '${staging.replace(/'/g, "''")}' | Out-Null`
], { cwd: root, encoding: "utf8" });

for (const rel of [...reviewFiles, "reports/phase-2r-a1-source-manifest.txt"]) {
  const abs = join(root, rel);
  if (!existsSync(abs)) continue;
  const dest = join(staging, rel.replace(/\//g, "\\"));
  const destDir = dirname(dest);
  mkdirSync(destDir, { recursive: true });
  writeFileSync(dest, readFileSync(abs));
}

const reviewZip = join(reports, "phase-2r-a1-review-source-2026-08-09.zip");
if (existsSync(reviewZip)) unlinkSync(reviewZip);
const r = spawnSync("powershell", ["-NoProfile", "-Command",
  `Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${reviewZip.replace(/'/g, "''")}' -Force`
], { cwd: root, encoding: "utf8" });
if (r.status !== 0 || !existsSync(reviewZip)) {
  console.error(r.stdout, r.stderr);
  throw new Error("review zip failed");
}
spawnSync("powershell", ["-NoProfile", "-Command",
  `Remove-Item -Recurse -Force '${staging.replace(/'/g, "''")}'`
], { cwd: root, encoding: "utf8" });

console.log("manifest", manifestPath);
console.log("reviewZip", reviewZip, statSync(reviewZip).size);
console.log("NOTE: review-only package — not a full-repo deliverable");
