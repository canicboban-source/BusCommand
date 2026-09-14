import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const lib = require("../../scripts/lib/surface-html.js");

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function trackedHashes() {
  const out = {};
  for (const name of ["index.html", "staff.html", "driver.html"]) {
    out[name] = sha256(path.join(root, name));
  }
  return out;
}

function runNode(scriptRel, args) {
  return spawnSync(process.execPath, [path.join(root, scriptRel), ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env
  });
}

test("package.json regular build checks surfaces and does not write them", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts.build, /build-surface-html\.js --check/);
  assert.doesNotMatch(pkg.scripts.build, /build-surface-html\.js(?:\s+&&|\s*$)/);
  assert.doesNotMatch(pkg.scripts.build, /ensure-favicon\.js/);
  assert.equal(pkg.scripts["build:surfaces"], "node scripts/build-surface-html.js --write");
});

test("regular surface check does not change tracked HTML", () => {
  const before = trackedHashes();
  const mtimeBefore = fs.statSync(path.join(root, "index.html")).mtimeMs;
  const result = runNode("scripts/build-surface-html.js", ["--check"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const after = trackedHashes();
  assert.deepEqual(after, before);
  assert.equal(fs.statSync(path.join(root, "index.html")).mtimeMs, mtimeBefore);
});

test("write/generate mode is explicit", () => {
  assert.equal(lib.parseCliArgs([]).mode, "check");
  assert.equal(lib.parseCliArgs(["--check"]).mode, "check");
  assert.equal(lib.parseCliArgs(["--write"]).mode, "write");
  assert.throws(() => lib.parseCliArgs(["--check", "--write"]), /either --check or --write/);
});

test("stale surface is detected in a temp directory without touching tracked HTML", () => {
  const before = trackedHashes();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bc-surface-stale-"));
  try {
    lib.writeSurfaces({ root, dir: tmp, syncDist: false });
    fs.appendFileSync(path.join(tmp, "staff.html"), "\n<!-- stale-fixture -->\n");
    assert.throws(
      () => lib.checkSurfaces({ root, dir: tmp }),
      (err) => /stale/i.test(err.message) && Array.isArray(err.stale) && err.stale.includes("staff.html")
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.deepEqual(trackedHashes(), before);
});

test("favicon transform is idempotent", () => {
  const sample = "<html><head><title>T</title>\n<link rel=\"icon\" href=\"/old.ico\">\n</head></html>\n";
  const once = lib.applyFavicon(sample);
  const twice = lib.applyFavicon(once);
  assert.equal(twice, once);
  lib.assertFavicon(once, "sample.html");
});

test("CRLF input does not duplicate favicon links", () => {
  const crlf = "<html><head><title>T</title>\r\n<link rel=\"icon\" href=\"/brand/logo-hero.png\">\r\n</head></html>\r\n";
  const out = lib.applyFavicon(crlf);
  assert.equal(out.includes("\r"), false);
  assert.equal((out.match(/rel="icon"/g) || []).length, 1);
  assert.equal((out.match(/rel="apple-touch-icon"/g) || []).length, 1);
  assert.equal((out.match(/\/brand\/logo-hero\.png/g) || []).length, 2);
  assert.equal(out, lib.applyFavicon(out));
  lib.assertFavicon(out, "crlf.html");
});

test("canonical surfaces carry entry, surface marker, and favicon", () => {
  const { files } = lib.buildCanonicalSurfaces(root);
  assert.match(files["driver.html"], /data-app-surface="driver"/);
  assert.match(files["driver.html"], /js\/main-driver\.js/);
  assert.match(files["staff.html"], /data-app-surface="staff"/);
  assert.match(files["staff.html"], /js\/main-staff\.js/);
  assert.match(files["index.html"], /id="compare"/);
  for (const name of ["index.html", "staff.html", "driver.html"]) {
    lib.assertFavicon(files[name], name);
    assert.doesNotMatch(files[name], /logo-mark\.svg/);
  }
});

test("write to --out-dir does not mutate tracked HTML", () => {
  const before = trackedHashes();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bc-surface-out-"));
  try {
    const result = runNode("scripts/build-surface-html.js", ["--write", "--out-dir", tmp]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    for (const name of ["index.html", "staff.html", "driver.html"]) {
      assert.ok(fs.existsSync(path.join(tmp, name)), name);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.deepEqual(trackedHashes(), before);
});

test("ensure-favicon default is check, not write", () => {
  const before = trackedHashes();
  const mtimeBefore = fs.statSync(path.join(root, "driver.html")).mtimeMs;
  const result = runNode("scripts/ensure-favicon.js", []);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.statSync(path.join(root, "driver.html")).mtimeMs, mtimeBefore);
  assert.deepEqual(trackedHashes(), before);
});
