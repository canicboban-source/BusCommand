const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const ignoredDirectories = new Set([
  ".git", "node_modules", "dist", "build", ".cache", "test-results", "playwright-report", ".firebase"
]);
// Do not ignore firebase-admin-key.json — presence is a hard failure (see test below).
const ignoredFileNames = new Set();
const scannedExtensions = new Set([
  ".css", ".html", ".js", ".json", ".mjs", ".md", ".rules", ".txt", ".yaml", ".yml"
]);

// The Firebase Web API key is a public client identifier that ships inside the
// browser bundle, so it is deployment configuration rather than a secret. It is
// still pinned to exactly two declaration points plus the isolation guard, so a
// stray copy in an operational script cannot silently target another project.
const webApiKeyAllowlist = new Set([
  path.join(".env.example"),
  path.join("render.yaml"),
  path.join("scripts", "check-firebase-isolation.js"),
  path.join("tests", "unit", "repo-secrets.test.js")
]);

function collectFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(filePath));
    else if (ignoredFileNames.has(entry.name)) continue;
    else if (/^serviceAccount.*\.json$/i.test(entry.name)) continue;
    else if (scannedExtensions.has(path.extname(entry.name).toLowerCase())) files.push(filePath);
  }
  return files;
}

const repoFiles = collectFiles(root).map((file) => ({
  relative: path.relative(root, file),
  content: fs.readFileSync(file, "utf8")
}));

test("no service account private key material is committed", () => {
  const pemHeader = ["-----", "BEGIN"].join("");
  const privateKeyField = ["private", "_key"].join("");
  const findings = repoFiles
    .filter(({ content }) => content.includes(pemHeader) || content.includes(`"${privateKeyField}"`))
    .map(({ relative }) => relative);
  assert.deepEqual(findings, []);
});

test("admin service-account key file must not exist in the working tree", () => {
  assert.equal(fs.existsSync(path.join(root, "firebase-admin-key.json")), false);
  assert.equal(fs.existsSync(path.join(root, "dist", "firebase-admin-key.json")), false);
});

test("gitignore keeps admin keys and env files out of version control", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  for (const pattern of ["firebase-admin-key.json", "serviceAccount*.json", ".env", ".env.*"]) {
    assert.ok(gitignore.includes(pattern), `missing .gitignore pattern: ${pattern}`);
  }
  assert.equal(fs.existsSync(path.join(root, "firebase-admin-key.json.example")), false);
});

test("Firebase Web API key appears only in declared configuration", () => {
  const marker = ["AIza", "Sy"].join("");
  const findings = repoFiles
    .filter(({ content }) => content.includes(marker))
    .map(({ relative }) => relative)
    .filter((relative) => !webApiKeyAllowlist.has(relative));
  assert.deepEqual(findings, []);
});

test("server secrets are injected by the platform, never stored in the repository", () => {
  const render = fs.readFileSync(path.join(root, "render.yaml"), "utf8");
  for (const secret of ["FIREBASE_SERVICE_ACCOUNT_JSON", "CONFIRMATION_JOB_SECRET"]) {
    const declaration = new RegExp(`key: ${secret}[\\s\\S]{0,40}sync: false`);
    assert.match(render, declaration, `${secret} must be declared as an unsynced secret`);
    assert.doesNotMatch(render, new RegExp(`key: ${secret}[\\s\\S]{0,40}value:`));
  }
});

test("live smoke script resolves its target and Web API key from the environment", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "l7-live-smoke.js"), "utf8");
  assert.match(script, /process\.env\.L7_SMOKE_BASE_URL/);
  assert.match(script, /process\.env\.VITE_FIREBASE_API_KEY/);
  assert.match(script, /if \(!API_KEY\)/);
});

test("incident live smoke resolves its target and Web API key from the environment", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "live-incident-smoke.js"), "utf8");
  assert.match(script, /process\.env\.L7_SMOKE_BASE_URL/);
  assert.match(script, /process\.env\.VITE_FIREBASE_API_KEY/);
  assert.match(script, /if \(!API_KEY\)/);
  assert.doesNotMatch(script, /AIzaSy/);
});
