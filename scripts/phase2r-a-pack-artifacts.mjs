/**
 * Pack FAZA 2R-A deliverable + review-source ZIPs and write SHA-256 manifest.
 * Excludes node_modules / .git / dist / .env / .tools from deliverable content selection.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports");
const baseSha = "a6fbcb508c67287c33479f38c3678cd44684ee60";

const reviewFiles = [
  "server/staff-monthly-plan-import.js",
  "server/driver-routes.js",
  "server/plan-import-preview.js",
  "server/shift-assignment.js",
  "js/dispatcher/plan-import.js",
  "js/core/api-client.js",
  "translations.js",
  "tests/unit/staff-monthly-plan-import.test.js",
  "tests/unit/phase2r-a-monthly-import-http.test.js",
  "tests/unit/plan-import-preview.test.js",
  "tests/e2e/dispo-monthly-import-server.spec.js",
  "tests/e2e/line-310.spec.js",
  "scripts/phase2r-a-visual-trail.mjs",
  "reports/phase-2r-a-report-2026-08-09.md",
  "reports/phase-2r-a-change-ledger.md"
];

const deliverableExtra = [
  "reports/phase-2r-a-logs",
  "reports/phase-2r-a-visual",
  "reports/phase-2r-a-source-manifest.txt"
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const manifestPath = join(reports, "phase-2r-a-source-manifest.txt");
const lines = [
  "PHASE 2R-A - SOURCE MANIFEST",
  "date: 2026-08-09",
  "purpose: reliability correction review package (STOP - no commit/push/deploy)",
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

const reviewZip = join(reports, "phase-2r-a-review-source-2026-08-09.zip");
const deliverableZip = join(reports, "phase-2r-a-deliverable-2026-08-09.zip");
for (const z of [reviewZip, deliverableZip]) {
  if (existsSync(z)) unlinkSync(z);
}

function compress(paths, dest) {
  const existing = paths
    .filter((p) => existsSync(join(root, p)))
    .map((p) => p.replace(/\//g, "\\"));
  const literal = existing.map((p) => `'${p.replace(/'/g, "''")}'`).join(",");
  const destLit = dest.replace(/'/g, "''");
  const cmd = `Compress-Archive -LiteralPath @(${literal}) -DestinationPath '${destLit}' -Force`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], {
    cwd: root,
    encoding: "utf8"
  });
  if (r.status !== 0 || !existsSync(dest)) {
    console.error(r.stdout);
    console.error(r.stderr);
    throw new Error(`Compress-Archive failed for ${dest} (status=${r.status})`);
  }
}

compress([...reviewFiles, "reports/phase-2r-a-source-manifest.txt"], reviewZip);
compress([...reviewFiles, ...deliverableExtra], deliverableZip);

console.log("manifest", manifestPath);
console.log("reviewZip", reviewZip, statSync(reviewZip).size);
console.log("deliverableZip", deliverableZip, statSync(deliverableZip).size);
