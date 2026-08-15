/**
 * FAZA 2R-B.1.1 — recovery URL trust boundary + file/drop snapshot contracts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLazyModuleLoader,
  isTrustedPlanImportRecoveryUrl,
  isTrustedPlanImportPathname,
  resolveTrustedPlanImportRecoveryBase,
  importPlanImportModule
} from "../../js/dispatcher/plan-import-loader.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = "http://127.0.0.1:8766";

test("2R-B.1.1 A: foreign-origin performance URL is rejected; recoveryImport not called", async () => {
  const evil = "https://attacker.example/plan-import-evil.js";
  assert.equal(isTrustedPlanImportRecoveryUrl(evil, ORIGIN), null);
  assert.equal(
    resolveTrustedPlanImportRecoveryBase(
      new Error("Failed to fetch dynamically imported module: http://127.0.0.1:8766/missing.js"),
      [{ name: evil }],
      ORIGIN
    ),
    null
  );

  let recoveryCalls = 0;
  await assert.rejects(
    () => importPlanImportModule({
      nativeImport: async () => { throw new Error("native fail"); },
      recoveryImport: async () => {
        recoveryCalls += 1;
        return { evil: true };
      },
      getPerformanceEntries: () => [{ name: evil }],
      getPageOrigin: () => ORIGIN
    }),
    /native fail/
  );
  assert.equal(recoveryCalls, 0);
});

test("2R-B.1.1 A: reject protocol-relative, credentials, malformed, lookalikes", () => {
  assert.equal(isTrustedPlanImportRecoveryUrl("//attacker.example/assets/plan-import-abc.js", ORIGIN), null);
  assert.equal(
    isTrustedPlanImportRecoveryUrl("http://user:pass@127.0.0.1:8766/assets/plan-import-abc.js", ORIGIN),
    null
  );
  assert.equal(isTrustedPlanImportRecoveryUrl("not a url", ORIGIN), null);
  assert.equal(
    isTrustedPlanImportRecoveryUrl(`${ORIGIN}/assets/plan-import-abc.js/../evil.js`, ORIGIN),
    null
  );
  assert.equal(
    isTrustedPlanImportRecoveryUrl(`${ORIGIN}/assets/plan-import%2eevil.js`, ORIGIN),
    null
  );
  assert.equal(isTrustedPlanImportPathname("/assets/plan-import-evil.js.exe"), false);
  assert.equal(isTrustedPlanImportPathname("/assets/xplan-import-abc.js"), false);
});

test("2R-B.1.1 A: same-origin hashed plan-import URL uses recovery query", async () => {
  const base = `${ORIGIN}/assets/plan-import-CuLISxvx.js`;
  assert.equal(isTrustedPlanImportRecoveryUrl(`${base}?x=1`, ORIGIN), base);

  let seen = null;
  const mod = await importPlanImportModule({
    nativeImport: async () => {
      throw new Error(`Failed to fetch dynamically imported module: ${base}`);
    },
    recoveryImport: async (url) => {
      seen = url;
      return { ok: true };
    },
    getPerformanceEntries: () => [],
    getPageOrigin: () => ORIGIN,
    now: () => 1700000000000
  });
  assert.equal(mod.ok, true);
  assert.equal(seen, `${base}?bc_recovery=1700000000000`);
});

test("2R-B.1.1 A: performance entry alone can supply trusted same-origin URL", async () => {
  const base = `${ORIGIN}/assets/plan-import-AbCdEf12.js`;
  let seen = null;
  await importPlanImportModule({
    nativeImport: async () => { throw new Error("fail without url"); },
    recoveryImport: async (url) => {
      seen = url;
      return { ok: true };
    },
    getPerformanceEntries: () => [{ name: `${base}?v=1` }],
    getPageOrigin: () => ORIGIN,
    now: () => 42
  });
  assert.equal(seen, `${base}?bc_recovery=42`);
});

test("2R-B.1.1 B/C source: register wrappers snapshot files before await; clear input; no English fallback", () => {
  const reg = fs.readFileSync(path.join(root, "js/register-onclick-staff.js"), "utf8");
  assert.match(reg, /Array\.from\(event\?\.dataTransfer\?\.files/);
  assert.match(reg, /Array\.from\(input\?\.files/);
  assert.match(reg, /input\.value\s*=\s*""/);
  assert.match(reg, /mod\.handleBulkPlanFiles\(files\)/);
  assert.match(reg, /showToast\(\s*t\(\s*["']plan_import_chunk_load_failed["']\s*\)\s*,/);
  assert.doesNotMatch(
    reg,
    /showToast\(\s*t\(\s*["']plan_import_chunk_load_failed["']\s*\)\s*\|\|/
  );

  const pi = fs.readFileSync(path.join(root, "js/dispatcher/plan-import.js"), "utf8");
  assert.match(pi, /export\s*\{[\s\S]*handleBulkPlanFiles[\s\S]*\}/);
});

test("2R-B.1.1 B: i18n tells user to re-choose file; no 'files stay' claim", () => {
  const src = fs.readFileSync(path.join(root, "translations.js"), "utf8");
  assert.match(src, /plan_import_chunk_load_failed:\s*"Monthly import module could not be loaded\. Check your connection, then choose the file again\."/);
  assert.match(src, /plan_import_chunk_load_failed:\s*"Modul za mesečni uvoz nije učitan\. Proverite vezu, zatim ponovo izaberite fajl\."/);
  assert.match(src, /plan_import_chunk_load_failed:\s*"Monatsimport-Modul konnte nicht geladen werden\. Verbindung prüfen, dann Datei erneut auswählen\."/);
  assert.doesNotMatch(src, /plan_import_chunk_load_failed:[^,]*(stay in place|ostaju na mestu|bleiben erhalten)/i);
});

test("2R-B.1.1 B: file-input failure clears value and next load can succeed once", async () => {
  let attempts = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("chunk_fail");
    return {
      handleBulkPlanFiles: async (files) => ({ n: files.length, name: files[0]?.name })
    };
  });

  const input = { files: [{ name: "same.txt" }], value: "C:\\fakepath\\same.txt" };
  const event = { target: input };
  const files = Array.from(event.target.files || []);
  input.value = "";

  await assert.rejects(() => loader.load(), /chunk_fail/);
  assert.equal(input.value, "");

  const mod = await loader.load();
  const result = await mod.handleBulkPlanFiles(files);
  assert.equal(result.n, 1);
  assert.equal(result.name, "same.txt");
  assert.equal(attempts, 2);
});

test("2R-B.1.1 C: cold drop keeps File snapshot across pending load", async () => {
  let resolveGate;
  const gate = new Promise((r) => { resolveGate = r; });
  let attempts = 0;
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    await gate;
    return {
      handleBulkPlanFiles: async (files) => files.map((f) => f.name)
    };
  });

  const file = { name: "drop-plan.txt" };
  const event = {
    preventDefault() {},
    dataTransfer: { files: [file] }
  };
  event.preventDefault();
  const files = Array.from(event.dataTransfer.files || []);

  const pending = loader.load().then((mod) => mod.handleBulkPlanFiles(files));
  // Simulate DataTransfer wipe after sync snapshot (browser behavior after drop returns).
  event.dataTransfer.files = [];
  resolveGate();
  const names = await pending;
  assert.deepEqual(names, ["drop-plan.txt"]);
  assert.equal(attempts, 1);
});

test("2R-B.1.1: parallel load still one chunk request", async () => {
  let attempts = 0;
  let resolveGate;
  const gate = new Promise((r) => { resolveGate = r; });
  const loader = createLazyModuleLoader(async () => {
    attempts += 1;
    await gate;
    return { ok: true };
  });
  const a = loader.load();
  const b = loader.load();
  assert.equal(a, b);
  resolveGate();
  await Promise.all([a, b]);
  assert.equal(attempts, 1);
});

test("2R-B.1.1: valid loose fixture still parses to a day with 101.S01", async () => {
  const text = fs.readFileSync(
    path.join(root, "tests/fixtures/qa-monthly-plan-import-loose.txt"),
    "utf8"
  );
  const { parseExtractedScheduleText } = await import("../../js/maps/schedule-import-utils.js");
  const parsed = parseExtractedScheduleText(text);
  assert.equal(parsed.month, "2026-08");
  assert.equal(parsed.shifts[3].routeCode, "101.S01");
  assert.equal(parsed.shifts[3].bus, "91101");
});
