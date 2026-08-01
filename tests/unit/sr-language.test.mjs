import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");
const translationsSource = fs.readFileSync(path.join(root, "translations.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(translationsSource, context);

const forbidden = [
  "provjera", "vjetrobransko", "vrijeme", "poslije", "prije", "sljedeć",
  "uspješno", "vrijednost", "izvještaj", "zahtjev", "rješenj",
  "obavještenj", "svjetl", "smjer", "nedjelj", "cijel"
];

test("effective SR translations use Latin ekavian Serbian", () => {
  const sr = context.window.TRANSLATIONS.sr;
  const values = Object.entries(sr)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .toLocaleLowerCase("sr-Latn");

  assert.match(values, /provera/);
  assert.match(values, /vetrobransko staklo/);
  for (const fragment of forbidden) {
    assert.doesNotMatch(values, new RegExp(fragment, "i"), `SR contains non-ekavian fragment: ${fragment}`);
  }
});

test("production source outside language catalogs has no listed ijekavian fragments", () => {
  const ignored = new Set([".git", "node_modules", "dist", "test-results", "playwright-report", ".cache"]);
  const findings = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(?:html|js|mjs)$/.test(entry.name)
        && entry.name !== "translations.js"
        && !file.includes(`${path.sep}tests${path.sep}`)
        && !entry.name.endsWith(".legacy.js")) {
        const source = fs.readFileSync(file, "utf8").toLocaleLowerCase("sr-Latn");
        for (const fragment of forbidden) if (source.includes(fragment)) findings.push(`${path.relative(root, file)}:${fragment}`);
      }
    }
  };
  walk(root);
  assert.deepEqual(findings, []);
});
