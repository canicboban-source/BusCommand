/**
 * FAZA 2R-A.3 packer — accurate manifest (body hash, no self-hash trap),
 * ZIP entries with "/", includes AGENTS.md + .cursor/rules, git status/diff/patch.
 */
import { createHash } from "crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  unlinkSync,
  mkdirSync
} from "fs";
import { dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports");
const logs = join(reports, "phase-2r-a3-logs");
mkdirSync(logs, { recursive: true });
const baseSha = "a6fbcb508c67287c33479f38c3678cd44684ee60";
const MANIFEST_NAME = "reports/phase-2r-a3-source-manifest.txt";

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  ".tools",
  "test-results",
  "playwright-report",
  "agent-transcripts",
  "agent-tools"
]);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function toPosix(rel) {
  return rel.split(sep).join("/");
}

function shouldSkipDir(name) {
  return EXCLUDE_DIR_NAMES.has(name);
}

function shouldSkipFile(name, relPosix) {
  if (name.startsWith(".env")) return true;
  if (name.endsWith(".zip") && relPosix.startsWith("reports/")) return true;
  if (name.endsWith(".tmp")) return true;
  if (name.startsWith("_phase2r-a3-") || name.startsWith("_tmp-")) return true;
  // Pack logs written during/after packaging must not lock or inflate the zip mid-run.
  if (relPosix === "reports/phase-2r-a3-logs/pack.txt"
    || relPosix === "reports/phase-2r-a3-logs/pack-run.tmp") return true;
  if (["firestore-debug.log", "firebase-debug.log", "ui-debug.log"].includes(name)) return true;
  return false;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const relPosix = toPosix(relative(root, abs));
    let st;
    try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) {
      if (shouldSkipDir(name)) continue;
      if (name === ".cursor") {
        const rules = join(abs, "rules");
        if (existsSync(rules)) walk(rules, out);
        continue;
      }
      walk(abs, out);
      continue;
    }
    if (!st.isFile()) continue;
    if (shouldSkipFile(name, relPosix)) continue;
    if (relPosix === MANIFEST_NAME) continue;
    out.push(relPosix);
  }
  return out;
}

const status = spawnSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" });
const diffStat = spawnSync("git", ["diff", "--stat", baseSha], { cwd: root, encoding: "utf8" });
const patch = spawnSync("git", ["diff", baseSha], { cwd: root, encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
writeFileSync(join(reports, "phase-2r-a3-git-status-short.txt"), status.stdout || "");
writeFileSync(join(reports, "phase-2r-a3-git-diff-stat.txt"), diffStat.stdout || "");
writeFileSync(join(reports, "phase-2r-a3-base-to-working.patch"), patch.stdout || "");
// Contract aliases without phase prefix
writeFileSync(join(reports, "git-status-short.txt"), status.stdout || "");
writeFileSync(join(reports, "git-diff-stat.txt"), diffStat.stdout || "");
writeFileSync(join(reports, "base-to-working.patch"), patch.stdout || "");

const allSource = walk(root).sort((a, b) => a.localeCompare(b));
const bodyLines = [
  "PHASE 2R-A.3 - SOURCE MANIFEST BODY",
  "date: 2026-08-09",
  "base SHA:",
  baseSha,
  "note: manifest file itself is excluded from body hashes (footer records body SHA-256)",
  "excludes: node_modules, .git, dist, .env*, .tools, reports/*.zip, temp packer files",
  `file count: ${allSource.length}`,
  "",
  "SHA-256 size path:"
];
for (const rel of allSource) {
  const abs = join(root, rel);
  const buf = readFileSync(abs);
  bodyLines.push(`${sha256(buf)}  ${buf.length}  ${rel}`);
}
const bodyText = `${bodyLines.join("\n")}\n`;
const bodyHash = sha256(Buffer.from(bodyText, "utf8"));
const manifestText = [
  bodyText.trimEnd(),
  "",
  "---",
  "FOOTER",
  `body-sha256: ${bodyHash}`,
  `listed-files: ${allSource.length}`,
  "self-hash-policy: manifest excluded from body; footer body-sha256 verifies listed content",
  ""
].join("\n");
writeFileSync(join(root, MANIFEST_NAME), manifestText);

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
$files = @(Get-Content -LiteralPath $listPath | Where-Object { $_ -and $_.Trim().Length -gt 0 })
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($rel in $files) {
    $arc = ($rel -replace '\\\\','/').TrimStart('/')
    $abs = Join-Path $root (($rel -replace '/', [IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $abs)) { throw "missing $rel" }
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $abs, $arc, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $zip.Dispose() }
$verify = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $names = @($verify.Entries | ForEach-Object { $_.FullName })
  $bad = @($names | Where-Object { $_.Contains([char]92) })
  if ($names.Count -ne $files.Count) { throw "count mismatch zip=$($names.Count) list=$($files.Count)" }
  if ($bad.Count -gt 0) { throw "backslash entries" }
  Write-Output ("entries=" + $names.Count)
  Write-Output ("backslash_entries=0")
  Write-Output ("bytes=" + (Get-Item -LiteralPath $zipPath).Length)
} finally { $verify.Dispose() }
`;
  const psFile = join(reports, "_phase2r-a3-zip.ps1");
  writeFileSync(psFile, ps);
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile], {
    cwd: root,
    encoding: "utf8"
  });
  try { unlinkSync(psFile); } catch { /* ignore */ }
  try { unlinkSync(listFile); } catch { /* ignore */ }
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`zip failed for ${zipAbs}`);
  }
  console.log(r.stdout.trim());
}

const reviewFiles = [
  "server/staff-monthly-plan-import.js",
  "server/group-monthly-plan-import.js",
  "server/driver-routes.js",
  "js/dispatcher/plan-import.js",
  "js/core/api-client.js",
  "translations.js",
  "AGENTS.md",
  "tests/unit/phase2r-a3-no-schema-single-flight.test.js",
  "tests/rules/phase2r-a3-commit-concurrency.test.js",
  "tests/e2e/dispo-monthly-import-server.spec.js",
  "scripts/phase2r-a3-visual-trail.mjs",
  "scripts/phase2r-a3-pack-artifacts.mjs",
  "scripts/phase2r-a3-d17-measure.mjs",
  "reports/phase-2r-a3-report-2026-08-09.md",
  "reports/phase-2r-a3-change-ledger.md",
  MANIFEST_NAME,
  "reports/phase-2r-a3-git-status-short.txt",
  "reports/phase-2r-a3-git-diff-stat.txt",
  "reports/phase-2r-a3-base-to-working.patch",
  "reports/git-status-short.txt",
  "reports/git-diff-stat.txt",
  "reports/base-to-working.patch",
  "reports/phase-2r-a3-visual/01-in-progress.png",
  "reports/phase-2r-a3-visual/02-in-progress-retry.png",
  "reports/phase-2r-a3-visual/03-recovery-required.png",
  "reports/phase-2r-a3-visual/04-xss-as-text.png",
  "reports/phase-2r-a3-visual/05-idempotent-success.png",
  "reports/phase-2r-a3-visual/TRAIL.json",
  "reports/phase-2r-a3-visual/README.md"
];

function collectDir(dirRel, acc = []) {
  const abs = join(root, dirRel);
  if (!existsSync(abs)) return acc;
  for (const name of readdirSync(abs)) {
    const child = join(abs, name);
    const rel = toPosix(relative(root, child));
    if (statSync(child).isDirectory()) collectDir(rel, acc);
    else if (!name.endsWith(".zip") && !name.startsWith("_phase2r-a3-")) acc.push(rel);
  }
  return acc;
}

const reviewList = [...new Set([
  ...reviewFiles.filter((r) => existsSync(join(root, r))),
  ...collectDir("reports/phase-2r-a3-logs"),
  ...collectDir(".cursor/rules")
])].sort();

const fullList = [...new Set([...allSource, MANIFEST_NAME])].sort();

const reviewZip = join(reports, "phase-2r-a3-review-source-2026-08-09.zip");
const fullZip = join(reports, "phase-2r-a3-full-deliverable-2026-08-09.zip");
for (const z of [reviewZip, fullZip]) {
  if (existsSync(z)) unlinkSync(z);
}

zipWithDotNet(reviewList, reviewZip, join(reports, "_phase2r-a3-review-list.txt"));
zipWithDotNet(fullList, fullZip, join(reports, "_phase2r-a3-full-list.txt"));

// Node verifier (exit 0 required)
const manifestOnDisk = readFileSync(join(root, MANIFEST_NAME), "utf8");
const footerMatch = manifestOnDisk.match(/body-sha256:\s*([a-f0-9]{64})/);
if (!footerMatch) throw new Error("footer missing body-sha256");
const parts = manifestOnDisk.split(/\n---\n/);
const bodyRebuilt = `${parts[0].trimEnd()}\n`;
const recomputed = sha256(Buffer.from(bodyRebuilt, "utf8"));
if (recomputed !== footerMatch[1]) {
  throw new Error(`body hash mismatch ${recomputed} vs ${footerMatch[1]}`);
}
const listed = [];
for (const line of manifestOnDisk.split(/\r?\n/)) {
  const m = line.match(/^[a-f0-9]{64}\s+\d+\s+(.+)$/);
  if (m) listed.push(m[1]);
}
for (const rel of listed) {
  if (!existsSync(join(root, rel))) throw new Error(`missing listed ${rel}`);
}
// Use PowerShell only to list zip entry names (no nested deps)
const listPs = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z = [IO.Compression.ZipFile]::OpenRead('${fullZip.replace(/'/g, "''")}')
try {
  $z.Entries | ForEach-Object { $_.FullName }
} finally { $z.Dispose() }
`;
const listFile = join(reports, "_phase2r-a3-zip-names.ps1");
writeFileSync(listFile, listPs);
const listedZip = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", listFile], {
  cwd: root,
  encoding: "utf8"
});
try { unlinkSync(listFile); } catch { /* ignore */ }
if (listedZip.status !== 0) throw new Error("zip list failed");
const entries = listedZip.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
const expectedCount = listed.length + 1; // + manifest
if (entries.length !== expectedCount) {
  throw new Error(`zip count ${entries.length} vs listed+manifest ${expectedCount}`);
}
if (entries.some((e) => e.includes("\\"))) throw new Error("backslash in zip");
if (!entries.includes(MANIFEST_NAME)) throw new Error("manifest missing in zip");
if (!entries.includes("AGENTS.md")) throw new Error("AGENTS.md missing in full zip");
if (!entries.some((e) => e.startsWith(".cursor/rules/"))) throw new Error(".cursor/rules missing in full zip");

const verifyOut = [
  "VERIFIER_OK",
  `listed=${listed.length}`,
  `zip_entries=${entries.length}`,
  `body_sha256=${recomputed}`,
  "self_hash_policy=body-sha256 footer (manifest excluded from body)",
  "backslash_entries=0",
  "EXIT=0"
].join("\n") + "\n";
writeFileSync(join(logs, "manifest-verifier.txt"), verifyOut);
console.log(verifyOut.trim());
console.log("reviewZip", reviewZip, statSync(reviewZip).size);
console.log("fullZip", fullZip, statSync(fullZip).size);
console.log("manifest listed", allSource.length, "zip", entries.length);
