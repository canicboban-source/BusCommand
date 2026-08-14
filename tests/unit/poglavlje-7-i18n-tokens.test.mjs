import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadTranslations() {
  const src = readFileSync(join(root, "translations.js"), "utf8");
  const sandbox = { window: {} };
  runInContext(src, createContext(sandbox));
  return sandbox.window.TRANSLATIONS;
}

test("en/sr/de required languages have matching key counts after P7.2 parity", () => {
  const T = loadTranslations();
  const en = Object.keys(T.en);
  const sr = Object.keys(T.sr);
  const missingEn = sr.filter((k) => !(k in T.en));
  const missingSr = en.filter((k) => !(k in T.sr));
  const missingDe = en.filter((k) => !(k in T.de));
  assert.equal(missingEn.length, 0, `EN missing: ${missingEn.join(",")}`);
  assert.equal(missingSr.length, 0, `SR missing: ${missingSr.join(",")}`);
  assert.equal(missingDe.length, 0, `DE missing: ${missingDe.join(",")}`);
  assert.ok(en.length >= 1300);
  assert.equal(Object.keys(T.de).length, sr.length);
});

test("staff and driver surfaces prefer design tokens over hard brand hex", () => {
  const staff = readFileSync(join(root, "css/staff-desktop.css"), "utf8");
  const driver = readFileSync(join(root, "css/driver-pwa.css"), "utf8");
  const tokens = readFileSync(join(root, "css/design-tokens.css"), "utf8");
  assert.match(staff, /--staff-accent:\s*var\(--primary-color\)/);
  assert.match(staff, /background:\s*var\(--bg-darker\)/);
  assert.doesNotMatch(staff, /--staff-accent:\s*#2563EB/);
  assert.match(driver, /var\(--success-strong\)/);
  assert.match(driver, /var\(--warning-strong\)/);
  assert.match(driver, /var\(--info-violet\)/);
  assert.match(tokens, /--success-strong:/);
  assert.match(tokens, /--info-violet:/);
});
