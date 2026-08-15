/**
 * FAZA 2R-B — product languages en/de/sr only (D23).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadTranslations() {
  const src = readFileSync(join(root, "translations.js"), "utf8");
  const sandbox = { window: {}, console };
  vm.runInNewContext(src, sandbox, { filename: "translations.js", timeout: 15000 });
  return sandbox.window.TRANSLATIONS;
}

function installMemoryStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); }
  };
}

test("D23: TRANSLATIONS has exactly de, en, sr", () => {
  const dicts = loadTranslations();
  assert.deepEqual(Object.keys(dicts).sort(), ["de", "en", "sr"]);
  for (const lang of ["hr", "es", "fr", "it", "tr", "pl", "pt", "nl", "ro", "hu", "cs", "sk", "bg"]) {
    assert.equal(dicts[lang], undefined, `unexpected dictionary ${lang}`);
  }
});

test("D23: login/header selectors offer only en/de/sr", () => {
  for (const file of ["staff.html", "driver.html", "index.legacy-monolith.html"]) {
    const html = readFileSync(join(root, file), "utf8");
    const login = html.match(/id="login-lang-select"[\s\S]*?<\/select>/);
    const header = html.match(/id="header-lang-select"[\s\S]*?<\/select>/);
    assert.ok(login, `${file} login select`);
    assert.ok(header, `${file} header select`);
    for (const block of [login[0], header[0]]) {
      const values = [...block.matchAll(/value="([a-z]{2})"/g)].map((m) => m[1]).sort();
      assert.deepEqual(values, ["de", "en", "sr"], `${file} lang options`);
      assert.doesNotMatch(block, /value="hr"/);
    }
  }
});

test("D23: unsupported persisted language falls back to en and rewrites storage", () => {
  const localStorage = installMemoryStorage();
  localStorage.setItem("buscommand_lang", "fr");
  const document = { documentElement: { lang: "en" }, getElementById() { return null; } };
  const window = {
    TRANSLATIONS: loadTranslations(),
    state: { language: "fr" }
  };
  const code = `
    function resolveUiLanguage(preferred) {
      const normalize = (value) => {
        const lang = String(value || "").trim().toLowerCase();
        if (!lang) return null;
        return window.TRANSLATIONS[lang] ? lang : null;
      };
      let stored = null;
      try { stored = localStorage.getItem("buscommand_lang"); } catch { stored = null; }
      return normalize(preferred)
        || normalize(stored)
        || normalize(window.state?.language)
        || "en";
    }
    function applyUiLanguagePreference(preferred) {
      const lang = resolveUiLanguage(preferred);
      window.state = { ...(window.state || {}), language: lang };
      if (localStorage.getItem("buscommand_lang") !== lang) {
        localStorage.setItem("buscommand_lang", lang);
      }
      document.documentElement.lang = lang;
      return lang;
    }
    ({ resolveUiLanguage, applyUiLanguagePreference });
  `;
  const api = vm.runInNewContext(code, { window, localStorage, document });
  assert.equal(api.resolveUiLanguage(), "en");
  assert.equal(api.applyUiLanguagePreference("hr"), "en");
  assert.equal(window.state.language, "en");
  assert.equal(localStorage.getItem("buscommand_lang"), "en");
  assert.equal(api.applyUiLanguagePreference("de"), "de");
  assert.equal(localStorage.getItem("buscommand_lang"), "de");
  assert.equal(api.applyUiLanguagePreference("sr"), "sr");
  assert.equal(api.applyUiLanguagePreference("en"), "en");
});

test("D23: PILOT_UI_LANGS source no longer includes hr", () => {
  const src = readFileSync(join(root, "js/core/state.js"), "utf8");
  assert.match(src, /PILOT_UI_LANGS = new Set\(\["de", "en", "sr"\]\)/);
  assert.doesNotMatch(src, /PILOT_UI_LANGS = new Set\(\[[^\]]*"hr"/);
});

test("D23: critical import/error UI strings are translated (no raw keys) in en/de/sr", () => {
  const dicts = loadTranslations();
  const keys = [
    "plan_import_idempotent_success",
    "plan_import_recovery_required",
    "plan_import_commit_unknown",
    "plan_import_server_required",
    "plan_import_clear",
    "plan_saved_count"
  ];
  for (const lang of ["en", "de", "sr"]) {
    for (const key of keys) {
      const val = dicts[lang][key];
      assert.ok(typeof val === "string" && val.length > 0, `${lang}.${key} missing`);
      assert.notEqual(val, key, `${lang}.${key} is raw key`);
      assert.doesNotMatch(val, /^plan_import_/);
    }
  }
});
