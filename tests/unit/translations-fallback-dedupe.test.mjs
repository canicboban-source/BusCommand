/**
 * WIDE-02: redundant EN-identical sr/de copies and leftover non-product
 * language literals may be omitted from source. Runtime window.TRANSLATIONS
 * must still expose the same languages, keys, values, and placeholders via
 * the existing EN fallback.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");
const source = fs.readFileSync(path.join(root, "translations.js"), "utf8");

function loadTranslations(src = source) {
  const sandbox = { window: {}, console };
  vm.runInNewContext(src, sandbox, { filename: "translations.js", timeout: 20000 });
  return sandbox.window.TRANSLATIONS;
}

function placeholders(value) {
  return [...new Set(String(value).match(/\{[A-Za-z0-9_]+\}/g) || [])].sort();
}

function lookup(dicts, lang, key, replacements = {}) {
  let text = (dicts[lang] && dicts[lang][key]) || (dicts.en && dicts.en[key]) || key;
  for (const [placeholder, value] of Object.entries(replacements)) {
    text = text.replace(`{${placeholder}}`, value);
  }
  return text;
}

function primaryLangBlock(src, lang) {
  const token = `\n    ${lang}: {`;
  const from = src.indexOf(token, src.indexOf("const TRANSLATIONS = "));
  if (from < 0) throw new Error(`missing TRANSLATIONS.${lang}`);
  const brace = src.indexOf("{", from);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i += 1;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  throw new Error(`unclosed TRANSLATIONS.${lang}`);
}

const OMITTED_IDENTICAL = [
  "saas_version",
  "ca_plan_download_pdf",
  "shift_code_off",
  "ops_attn_shift_applied"
];

const DEAD_LANG = /\b(?:hr|es|fr|it|tr|pl|pt|nl|ro|hu|cs|sk|bg):\s*["']/;

test("product dictionaries are exactly sr/en/de with identical key sets", () => {
  const dicts = loadTranslations();
  assert.deepEqual(Object.keys(dicts).sort(), ["de", "en", "sr"]);
  const enKeys = Object.keys(dicts.en).sort();
  assert.deepEqual(Object.keys(dicts.sr).sort(), enKeys);
  assert.deepEqual(Object.keys(dicts.de).sort(), enKeys);
  assert.ok(enKeys.length > 2000);
});

test("omitted identical sr/de copies still resolve through EN fallback and i18n lookup", () => {
  const dicts = loadTranslations();
  const srBlock = primaryLangBlock(source, "sr");
  const deBlock = primaryLangBlock(source, "de");
  for (const key of OMITTED_IDENTICAL) {
    assert.equal(typeof dicts.en[key], "string", `en.${key}`);
    assert.equal(dicts.sr[key], dicts.en[key], `sr.${key} fallback`);
    assert.equal(dicts.de[key], dicts.en[key], `de.${key} fallback`);
    assert.doesNotMatch(srBlock, new RegExp(`\\b${key}\\s*:`), `sr source still defines ${key}`);
    assert.doesNotMatch(deBlock, new RegExp(`\\b${key}\\s*:`), `de source still defines ${key}`);
    assert.deepEqual(placeholders(dicts.sr[key]), placeholders(dicts.en[key]));
    assert.equal(lookup(dicts, "sr", key), dicts.en[key]);
    assert.equal(lookup(dicts, "de", key), dicts.en[key]);
  }
  assert.match(lookup(dicts, "sr", "ops_attn_shift_applied", { driver: "Ana", duty: "S01" }), /Ana/);
  assert.match(lookup(dicts, "sr", "ops_attn_shift_applied", { driver: "Ana", duty: "S01" }), /S01/);
  assert.equal(
    placeholders(dicts.en.ops_attn_shift_applied).join(","),
    "{driver},{duty}"
  );
});

test("source does not reintroduce leftover non-product language copies", () => {
  assert.doesNotMatch(source, DEAD_LANG);
  assert.match(source, /for \(const lang of \["de", "sr"\]\)/);
  assert.match(source, /window\.TRANSLATIONS = TRANSLATIONS;/);
});
