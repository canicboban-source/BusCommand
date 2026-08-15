/**
 * FAZA 2R-B.1.2 — Dispo monthly import CTA opens native file chooser on user click.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("openMonthlyPlanImport sync-clicks file input (no setTimeout around click)", () => {
  const hub = read("js/dispatcher/group-hub.js");
  const start = hub.indexOf("function openMonthlyPlanImport(");
  assert.ok(start > -1);
  const end = hub.indexOf("\n/** @deprecated", start);
  const fn = hub.slice(start, end > start ? end : start + 1200);
  assert.ok(fn.includes("bulk-plan-import-files"), "must target file input");
  assert.match(fn, /input\.click\s*\(/);
  assert.doesNotMatch(fn, /setTimeout\s*\([\s\S]{0,120}?\.click\s*\(/);
  assert.doesNotMatch(fn, /\.focus\s*\?\./);
  const clickIdx = fn.indexOf("input.click(");
  // Ignore the word setTimeout inside comments — only call sites count.
  const timeoutCallIdx = fn.search(/setTimeout\s*\(/);
  assert.ok(clickIdx > -1);
  assert.ok(timeoutCallIdx === -1 || clickIdx < timeoutCallIdx, "click must not be deferred by setTimeout");
});

test("import panel exposes accessible Choose-files button via plan_import_choose_files", () => {
  const html = read("index.legacy-monolith.html");
  assert.match(html, /id="plan-import-choose-files"/);
  assert.match(html, /id="plan-import-choose-files"[\s\S]{0,200}data-i18n="plan_import_choose_files"/);
  assert.match(html, /data-action="clickElementById"[\s\S]*?bulk-plan-import-files/);
  assert.match(html, /id="plan-import-dropzone"[\s\S]*?data-drop-action="handleBulkPlanDrop"/);
  assert.match(html, /hub_plan_drop_hint|Excel\/CSV\/PDF/);
});

test("plan_import_choose_files is exact EN/DE/SR (formats stay in dropzone)", () => {
  const source = read("translations.js");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  assert.equal(context.window.TRANSLATIONS.en.plan_import_choose_files, "Choose files");
  assert.equal(context.window.TRANSLATIONS.de.plan_import_choose_files, "Dateien auswählen");
  assert.equal(context.window.TRANSLATIONS.sr.plan_import_choose_files, "Izaberi fajlove");
  // Dropzone / legacy select_file may still mention formats — button must not.
  for (const language of ["en", "de", "sr"]) {
    assert.doesNotMatch(context.window.TRANSLATIONS[language].plan_import_choose_files, /Excel|PDF|TXT|CSV/i);
  }
});

test("lazy plan-import reliability contracts remain (B.1 / B.1.1)", () => {
  const loader = read("js/dispatcher/plan-import-loader.js");
  const register = read("js/register-onclick-staff.js");
  assert.match(loader, /isTrustedPlanImportRecoveryUrl/);
  assert.match(loader, /cached === attempt/);
  assert.match(register, /Array\.from\([\s\S]*files|snapshot|File\[\]/);
  assert.doesNotMatch(read("staff.html") + read("index.legacy-monolith.html"), /modulepreload[^>]+plan-import/i);
});
