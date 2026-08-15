/**
 * FAZA 2R-A.2 — review-source ZIP + full-repo deliverable ZIP (entries use "/"),
 * plus SHA-256 source manifest (base SHA + size + hash per file).
 */
import { createHash } from "crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync
} from "fs";
import { dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports");
const baseSha = "a6fbcb508c67287c33479f38c3678cd44684ee60";

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".tools",
  "test-results",
  "playwright-report",
  ".cursor",
  "agent-transcripts",
  "agent-tools"
]);

const EXCLUDE_FILE_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "firestore-debug.log",
  "firebase-debug.log",
  "ui-debug.log"
]);

const reviewFiles = [
  "server/staff-monthly-plan-import.js",
  "server/group-monthly-plan-import.js",
  "server/driver-routes.js",
  "js/dispatcher/plan-import.js",
  "js/core/api-client.js",
  "js/core/utils.js",
  "translations.js",
  "tests/unit/phase2r-a2-reliability-guard.test.js",
  "tests/unit/phase2r-a2-http-outcomes.test.js",
  "tests/unit/phase2r-a2-html-escape.test.js",
  "tests/unit/phase2r-a1-http.test.js",
  "tests/unit/phase2r-a-monthly-import-http.test.js",
  "tests/unit/staff-monthly-plan-import.test.js",
  "tests/e2e/dispo-monthly-import-server.spec.js",
  "scripts/phase2r-a2-visual-trail.mjs",
  "scripts/phase2r-a2-d17-measure.mjs",
  "scripts/phase2r-a2-pack-artifacts.mjs",
  "reports/phase-2r-a2-report-2026-08-09.md",
  "reports/phase-2r-a2-change-ledger.md"
];

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function toPosix(rel) {
  return rel.split(sep).join("/");
}

function shouldSkipDir(name) {
  return EXCLUDE_DIR_NAMES.has(name);
}

function shouldSkipFile(name, relPosix) {
  if (EXCLUDE_FILE_NAMES.has(name)) return true;
  if (name.endsWith(".zip") && relPosix.startsWith("reports/")) return true;
  if (name.startsWith(".env")) return true;
  return false;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const relPosix = toPosix(relative(root, abs));
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (shouldSkipDir(name)) continue;
      walk(abs, out);
      continue;
    }
    if (!st.isFile()) continue;
    if (shouldSkipFile(name, relPosix)) continue;
    out.push(relPosix);
  }
  return out;
}

const allSource = walk(root).sort((a, b) => a.localeCompare(b));
const manifestPath = join(reports, "phase-2r-a2-source-manifest.txt");
const lines = [
  "PHASE 2R-A.2 - FULL SOURCE MANIFEST",
  "date: 2026-08-09",
  "package-type: full deliverable (npm install/test/build without secrets)",
  "excludes: node_modules, .git, dist, .env*, .tools, nested reports/*.zip",
  "purpose: final reliability guard (STOP - no commit/push/deploy)",
  "",
  "base SHA:",
  baseSha,
  "",
  `file count: ${allSource.length}`,
  "",
  "SHA-256 size path:"
];
for (const rel of allSource) {
  const abs = join(root, rel);
  lines.push(`${sha256(abs)}  ${statSync(abs).size}  ${rel}`);
}
writeFileSync(manifestPath, `${lines.join("\n")}\n`);

function collectLogs(dirRel, acc = []) {
  const abs = join(root, dirRel);
  if (!existsSync(abs)) return acc;
  for (const name of readdirSync(abs)) {
    const child = join(abs, name);
    const rel = toPosix(relative(root, child));
    if (statSync(child).isDirectory()) collectLogs(rel, acc);
    else if (!name.endsWith(".zip") && !name.startsWith("_phase2r-a2-")) acc.push(rel);
  }
  return acc;
}

function zipWithDotNet(fileList, zipAbs, listFile) {
  writeFileSync(listFile, fileList.join("\n"), "utf8");
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = '${root.replace(/'/g, "''")}'
$zipPath = '${zipAbs.replace(/'/g, "''")}'
$listPath = '${listFile.replace(/'/g, "''")}'
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
$files = Get-Content -LiteralPath $listPath | Where-Object { $_ -and $_.Trim().Length -gt 0 }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($rel in $files) {
    $arc = ($rel -replace '\\\\','/').TrimStart('/')
    $abs = Join-Path $root (($rel -replace '/', [IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $abs)) { continue }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $abs, $arc, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally {
  $zip.Dispose()
}
$verify = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $names = @($verify.Entries | ForEach-Object { $_.FullName })
  $bad = @($names | Where-Object { $_.Contains([char]92) })
  Write-Output ("entries=" + $names.Count)
  Write-Output ("backslash_entries=" + $bad.Count)
  if ($bad.Count -gt 0) { throw ("backslash zip entries: " + ($bad[0..4] -join ', ')) }
  Write-Output ("sample=" + ($names[0..2] -join ' | '))
  Write-Output ("bytes=" + (Get-Item -LiteralPath $zipPath).Length)
} finally {
  $verify.Dispose()
}
`;
  const psFile = join(reports, "_phase2r-a2-zip.ps1");
  writeFileSync(psFile, ps);
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile], {
    cwd: root,
    encoding: "utf8"
  });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`dotnet zip failed for ${zipAbs}`);
  }
  console.log(r.stdout.trim());
  try { unlinkSync(psFile); } catch { /* ignore */ }
  try { unlinkSync(listFile); } catch { /* ignore */ }
}

const reviewZip = join(reports, "phase-2r-a2-review-source-2026-08-09.zip");
const fullZip = join(reports, "phase-2r-a2-full-deliverable-2026-08-09.zip");
for (const z of [reviewZip, fullZip]) {
  if (existsSync(z)) unlinkSync(z);
}

const reviewList = [
  ...reviewFiles,
  "reports/phase-2r-a2-source-manifest.txt",
  "reports/phase-2r-a2-visual/01-commit-in-progress.png",
  "reports/phase-2r-a2-visual/02-retry-retained-importId.png",
  "reports/phase-2r-a2-visual/03-recovery-required-no-false-rollback.png",
  "reports/phase-2r-a2-visual/04-escaped-malicious-fields.png",
  "reports/phase-2r-a2-visual/TRAIL.json",
  "reports/phase-2r-a2-visual/README.md",
  ...collectLogs("reports/phase-2r-a2-logs")
].filter((rel) => existsSync(join(root, rel)));

zipWithDotNet(
  [...new Set(reviewList)].sort(),
  reviewZip,
  join(reports, "_phase2r-a2-review-list.txt")
);

const fullList = [...new Set([...allSource, "reports/phase-2r-a2-source-manifest.txt"])].sort();
zipWithDotNet(fullList, fullZip, join(reports, "_phase2r-a2-full-list.txt"));

console.log("manifest", manifestPath, "files", allSource.length);
console.log("reviewZip", reviewZip, statSync(reviewZip).size);
console.log("fullZip", fullZip, statSync(fullZip).size);
