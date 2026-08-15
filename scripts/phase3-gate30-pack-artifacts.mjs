/**
 * FAZA 3.0-GATE packer — body-hash manifest + per-file SHA/size re-verify.
 */
import { createHash } from "crypto";
import {
  existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync, mkdirSync
} from "fs";
import { dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reports = join(root, "reports");
const logs = join(reports, "phase-3-gate30-logs");
mkdirSync(logs, { recursive: true });
const baseSha = "a6fbcb508c67287c33479f38c3678cd44684ee60";
const MANIFEST_NAME = "reports/phase-3-gate30-source-manifest.txt";

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules", ".git", "dist", ".tools", "test-results", "playwright-report",
  "agent-transcripts", "agent-tools"
]);

function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }
function toPosix(rel) { return rel.split(sep).join("/"); }

function shouldSkipFile(name, relPosix) {
  if (name.startsWith(".env")) return true;
  if (name.endsWith(".zip") && relPosix.startsWith("reports/")) return true;
  if (name.endsWith(".tmp")) return true;
  if (name.startsWith("_phase3-gate30-") || name.startsWith("_tmp-")) return true;
  if (relPosix === "reports/phase-3-gate30-logs/pack.txt") return true;
  if (relPosix === "reports/phase-3-gate30-logs/manifest-verifier.txt") return true;
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
      if (EXCLUDE_DIR_NAMES.has(name)) continue;
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
writeFileSync(join(reports, "phase-3-gate30-git-status-short.txt"), status.stdout || "");
writeFileSync(join(reports, "phase-3-gate30-git-diff-stat.txt"), diffStat.stdout || "");
writeFileSync(join(reports, "phase-3-gate30-base-to-working.patch"), patch.stdout || "");
writeFileSync(join(reports, "git-status-short.txt"), status.stdout || "");
writeFileSync(join(reports, "git-diff-stat.txt"), diffStat.stdout || "");
writeFileSync(join(reports, "base-to-working.patch"), patch.stdout || "");

const allSource = walk(root).sort((a, b) => a.localeCompare(b));
const bodyLines = [
  "PHASE 3.0-GATE - SOURCE MANIFEST BODY",
  "date: 2026-08-09",
  "base SHA:",
  baseSha,
  "policy: manifest excluded from body; footer body-sha256 verifies listed content",
  "policy: pack.txt + manifest-verifier.txt excluded (written after ZIP; avoids circular/stale hash)",
  "excludes: node_modules, .git, dist, .env*, .tools, reports/*.zip, *.tmp, temp packer files",
  `file count: ${allSource.length}`,
  "",
  "SHA-256 size path:"
];
const listedMeta = [];
for (const rel of allSource) {
  const buf = readFileSync(join(root, rel));
  const hash = sha256(buf);
  listedMeta.push({ rel, hash, size: buf.length });
  bodyLines.push(`${hash}  ${buf.length}  ${rel}`);
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
} finally { $verify.Dispose() }
`;
  const psFile = join(reports, "_phase3-gate30-zip.ps1");
  writeFileSync(psFile, ps);
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile], {
    cwd: root, encoding: "utf8"
  });
  try { unlinkSync(psFile); } catch { /* ignore */ }
  try { unlinkSync(listFile); } catch { /* ignore */ }
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`zip failed for ${zipAbs}`);
  }
  console.log(r.stdout.trim());
}

function collectDir(dirRel, acc = []) {
  const abs = join(root, dirRel);
  if (!existsSync(abs)) return acc;
  for (const name of readdirSync(abs)) {
    const child = join(abs, name);
    const rel = toPosix(relative(root, child));
    if (statSync(child).isDirectory()) collectDir(rel, acc);
    else if (!shouldSkipFile(name, rel)) acc.push(rel);
  }
  return acc;
}

const reviewFiles = [
  "js/admin/superadmin.js",
  "js/ui/row-actions-menu.js",
  "js/dispatcher/group-hub.js",
  "css/staff-desktop.css",
  "index.legacy-monolith.html",
  "translations.js",
  "AGENTS.md",
  "server/assignment-resource-guard.js",
  "tests/rules/phase2r-a31-cross-writer-atomicity.test.js",
  "tests/unit/phase2r-b12-import-cta.test.mjs",
  "tests/unit/phase2r-b12-sa-manage-account.test.mjs",
  "tests/unit/row-actions-menu-behavior.test.mjs",
  "tests/unit/assignment-resource-guard.test.js",
  "tests/e2e/phase2r-b12-import-cta-filechooser.spec.js",
  "tests/e2e/phase2r-b12-sa-manage-account.spec.js",
  "tests/e2e/row-actions-menu.spec.js",
  "scripts/build-function-inventory.mjs",
  "scripts/run-function-matrix.mjs",
  "scripts/pilot-verify-sa-open.mjs",
  "scripts/phase2r-b12-visual-trail.mjs",
  "scripts/phase3-gate30-pack-artifacts.mjs",
  "reports/phase-3-gate30-report-2026-08-09.md",
  "reports/phase-3-gate30-change-ledger.md",
  MANIFEST_NAME,
  "reports/phase-3-gate30-git-status-short.txt",
  "reports/phase-3-gate30-git-diff-stat.txt",
  "reports/phase-3-gate30-base-to-working.patch",
  "reports/git-status-short.txt",
  "reports/git-diff-stat.txt",
  "reports/base-to-working.patch"
];

const reviewList = [...new Set([
  ...reviewFiles.filter((r) => existsSync(join(root, r))),
  ...collectDir("reports/phase-3-gate30-logs"),
  ...collectDir("reports/phase-3-gate30-visual"),
  ...collectDir(".cursor/rules")
])].sort();
const fullList = [...new Set([...allSource, MANIFEST_NAME])].sort();

const reviewZip = join(reports, "phase-3-gate30-review-source-2026-08-09.zip");
const fullZip = join(reports, "phase-3-gate30-full-deliverable-2026-08-09.zip");
for (const z of [reviewZip, fullZip]) {
  if (existsSync(z)) unlinkSync(z);
}
zipWithDotNet(reviewList, reviewZip, join(reports, "_phase3-gate30-review-list.txt"));
zipWithDotNet(fullList, fullZip, join(reports, "_phase3-gate30-full-list.txt"));

const seen = new Set();
const dupes = [];
for (const { rel, hash, size } of listedMeta) {
  if (seen.has(rel)) dupes.push(rel);
  seen.add(rel);
  const buf = readFileSync(join(root, rel));
  if (sha256(buf) !== hash || buf.length !== size) {
    throw new Error(`hash/size mismatch for ${rel}`);
  }
  if (rel.includes("\\") || rel.includes("..") || rel.startsWith("/")) {
    throw new Error(`unsafe path ${rel}`);
  }
}
if (dupes.length) throw new Error(`duplicate listed paths: ${dupes.join(",")}`);

const footerMatch = manifestText.match(/body-sha256:\s*([a-f0-9]{64})/);
const bodyRebuilt = `${manifestText.split(/\n---\n/)[0].trimEnd()}\n`;
const recomputed = sha256(Buffer.from(bodyRebuilt, "utf8"));
if (!footerMatch || recomputed !== footerMatch[1]) {
  throw new Error(`body hash mismatch ${recomputed} vs ${footerMatch?.[1]}`);
}

function listZip(zipAbs) {
  const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$z=[IO.Compression.ZipFile]::OpenRead('${zipAbs.replace(/'/g, "''")}')
try { $z.Entries | ForEach-Object { $_.FullName } } finally { $z.Dispose() }
`;
  const f = join(reports, "_phase3-gate30-listzip.ps1");
  writeFileSync(f, ps);
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", f], {
    cwd: root, encoding: "utf8"
  });
  try { unlinkSync(f); } catch { /* ignore */ }
  if (r.status !== 0) throw new Error(`list zip failed ${zipAbs}`);
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

const fullEntries = listZip(fullZip);
const reviewEntries = listZip(reviewZip);
if (fullEntries.length !== listedMeta.length + 1) {
  throw new Error(`full zip ${fullEntries.length} != listed+manifest ${listedMeta.length + 1}`);
}
if (fullEntries.some((e) => e.includes("\\"))) throw new Error("backslash in full zip");
if (reviewEntries.some((e) => e.includes("\\"))) throw new Error("backslash in review zip");
if (!fullEntries.includes(MANIFEST_NAME)) throw new Error("manifest missing in full zip");
if (!fullEntries.includes("AGENTS.md")) throw new Error("AGENTS.md missing");
if (!fullEntries.some((e) => e.startsWith(".cursor/rules/"))) throw new Error("rules missing");
if (fullEntries.some((e) => e.endsWith(".zip"))) throw new Error("nested zip in full");

const verifyOut = [
  "VERIFIER_OK",
  `listed=${listedMeta.length}`,
  `full_zip_entries=${fullEntries.length}`,
  `review_zip_entries=${reviewEntries.length}`,
  `body_sha256=${recomputed}`,
  "per_file_hash_size_recheck=pass",
  "duplicates=0",
  "backslash_entries=0",
  "nested_zips=0",
  "stale_log_policy=pack.txt+manifest-verifier.txt excluded from body/ZIP; verifier written after pack",
  "EXIT=0"
].join("\n") + "\n";
writeFileSync(join(logs, "manifest-verifier.txt"), verifyOut);
console.log(verifyOut.trim());
console.log("reviewZip", reviewZip, statSync(reviewZip).size);
console.log("fullZip", fullZip, statSync(fullZip).size);
