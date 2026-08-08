#!/usr/bin/env node
/**
 * Fail build/CI if credential material or known secret files exist in the tree.
 * Does not print secret values.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "test-results",
  "playwright-report",
  ".cache",
  ".firebase"
]);

const FORBIDDEN_BASENAMES = [
  "firebase-admin-key.json",
  "firebase-admin-key.json.json",
  "serviceAccount.json",
  "service-account.json"
];

const errors = [];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

for (const name of FORBIDDEN_BASENAMES) {
  const p = path.join(ROOT, name);
  if (fs.existsSync(p)) {
    errors.push(`Forbidden credential file present: ${name}`);
  }
  const distP = path.join(ROOT, "dist", name);
  if (fs.existsSync(distP)) {
    errors.push(`Forbidden credential file present in dist/: ${name}`);
  }
}

const files = [];
walk(ROOT, files);

// Assembled so this file itself does not contain raw secret markers for scanners.
const pemHeader = ["-----", "BEGIN", " PRIVATE KEY-----"].join("");
const privateKeyField = ['"', "private", "_key", '"'].join("");

for (const file of files) {
  const base = path.basename(file);
  if (/^serviceAccount.*\.json$/i.test(base)) {
    errors.push(`Forbidden service account file: ${path.relative(ROOT, file)}`);
    continue;
  }
  if (FORBIDDEN_BASENAMES.includes(base) && path.dirname(file) !== ROOT) {
    errors.push(`Forbidden credential file: ${path.relative(ROOT, file)}`);
    continue;
  }
  const ext = path.extname(file).toLowerCase();
  if (![".js", ".mjs", ".json", ".md", ".txt", ".html", ".env", ".yml", ".yaml"].includes(ext)) {
    continue;
  }
  // Skip this checker and unit test that mention patterns safely.
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (rel === "scripts/check-no-secrets.js") continue;
  if (rel === "tests/unit/repo-secrets.test.js") continue;
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (content.includes(pemHeader) || content.includes(privateKeyField)) {
    errors.push(`Private key material detected in: ${rel}`);
  }
}

if (errors.length) {
  console.error("check-no-secrets FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("\nRotate any exposed Firebase/Google credentials in the cloud console.");
  process.exit(1);
}

console.log("check-no-secrets: OK");
