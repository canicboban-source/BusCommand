/**
 * Live-review #9: SA dashboard English while language select shows DE.
 * buscommand_lang must win over FRESH_STATE.language ("en") after tenant merges.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

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

function loadUiLanguageHelpers() {
    const localStorage = installMemoryStorage();
    const document = {
        documentElement: { lang: "en" },
        getElementById() { return null; }
    };
    const window = {
        TRANSLATIONS: { de: { x: "d" }, en: { x: "e" }, sr: { x: "s" } },
        state: null
    };
    const FRESH_STATE = { language: "en", branding: { name: "" }, drivers: [], groups: [] };
    const pure = `
      const PILOT_UI_LANGS = new Set(["de", "en", "sr"]);
      function getBaseState() { return { ...FRESH_STATE }; }
      function resolveUiLanguage(preferred) {
        const normalize = (value) => {
          const lang = String(value || "").trim().toLowerCase();
          if (!lang) return null;
          if (window.TRANSLATIONS) return window.TRANSLATIONS[lang] ? lang : null;
          return PILOT_UI_LANGS.has(lang) ? lang : null;
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
        if (!window.state) window.state = { ...getBaseState(), language: lang };
        else window.state.language = lang;
        try {
          if (localStorage.getItem("buscommand_lang") !== lang) {
            localStorage.setItem("buscommand_lang", lang);
          }
        } catch {}
        document.documentElement.lang = lang;
        return lang;
      }
      function resetInMemoryTenantState(language) {
        window.state = { ...getBaseState(), language: resolveUiLanguage(language) };
      }
      function loadStateFromStorage(companyId) {
        const base = getBaseState();
        if (!companyId) {
          window.state = { ...base };
          applyUiLanguagePreference();
          return;
        }
        window.state = { ...base };
        applyUiLanguagePreference();
      }
      ({ resolveUiLanguage, applyUiLanguagePreference, resetInMemoryTenantState, loadStateFromStorage, getBaseState });
    `;
    const api = vm.runInNewContext(pure, { localStorage, document, window, FRESH_STATE });
    return { api, localStorage, window };
}

test("resolveUiLanguage defaults to en when nothing is stored", () => {
    const { api, window } = loadUiLanguageHelpers();
    window.state = { language: "xx" };
    assert.equal(api.resolveUiLanguage(), "en");
});

test("resolveUiLanguage prefers buscommand_lang over FRESH_STATE en", () => {
    const { api, localStorage, window } = loadUiLanguageHelpers();
    localStorage.setItem("buscommand_lang", "de");
    window.state = { language: "en" };
    assert.equal(api.resolveUiLanguage(), "de");
});

test("applyUiLanguagePreference restores de after tenant-style en merge", () => {
    const { api, localStorage, window } = loadUiLanguageHelpers();
    localStorage.setItem("buscommand_lang", "de");
    window.state = { ...api.getBaseState(), language: "en", branding: { name: "Acme" } };
    assert.equal(window.state.language, "en");
    api.applyUiLanguagePreference();
    assert.equal(window.state.language, "de");
    assert.equal(localStorage.getItem("buscommand_lang"), "de");
});

test("resetInMemoryTenantState keeps buscommand_lang when state was en", () => {
    const { api, localStorage, window } = loadUiLanguageHelpers();
    localStorage.setItem("buscommand_lang", "de");
    window.state = { language: "en", drivers: [{ id: "x" }] };
    api.resetInMemoryTenantState();
    assert.equal(window.state.language, "de");
    assert.equal(window.state.drivers?.length || 0, 0);
});

test("loadStateFromStorage without companyId does not leave language as en when DE selected", () => {
    const { api, localStorage, window } = loadUiLanguageHelpers();
    localStorage.setItem("buscommand_lang", "de");
    api.loadStateFromStorage(null);
    assert.equal(window.state.language, "de");
});

test("pilot UI languages en/de/sr remain selectable", () => {
    const { api, localStorage } = loadUiLanguageHelpers();
    for (const lang of ["en", "de", "sr"]) {
        localStorage.setItem("buscommand_lang", lang);
        assert.equal(api.resolveUiLanguage(), lang);
    }
});

test("state.js wires resolve/apply helpers into reset and load paths", () => {
    const source = readFileSync(join(root, "js/core/state.js"), "utf8");
    assert.match(source, /function resolveUiLanguage/);
    assert.match(source, /function applyUiLanguagePreference/);
    assert.match(source, /buscommand_lang/);
    assert.match(source, /\|\|\s*"en"/);
    assert.match(source, /resetInMemoryTenantState[\s\S]*resolveUiLanguage/);
    assert.match(source, /loadStateFromStorage[\s\S]*applyUiLanguagePreference/);
});

test("init bootstrap resolves UI language via resolveUiLanguage", () => {
    const init = readFileSync(join(root, "js/bootstrap/init.js"), "utf8");
    assert.match(init, /resolveUiLanguage/);
    assert.match(init, /const savedLang = resolveUiLanguage\(\);/);
    assert.doesNotMatch(init, /buscommand_lang"\)\s*\|\|\s*"de"/);
});

test("initFirebase reapplies UI language after base-state merge", () => {
    const firebase = readFileSync(join(root, "js/core/firebase-service.js"), "utf8");
    assert.match(firebase, /applyUiLanguagePreference/);
    const initStart = firebase.indexOf("async function initFirebase");
    const initEnd = firebase.indexOf("\nexport {", initStart);
    const initBlock = firebase.slice(initStart, initEnd);
    // Each successful / fallback state replacement must restore UI language.
    assert.match(initBlock, /window\.state = \{ \.\.\._baseState\(\), \.\.\.cloudState \};\s*applyUiLanguagePreference\(\);/);
    assert.ok(
        [...initBlock.matchAll(/applyUiLanguagePreference\(\)/g)].length >= 5,
        "expected applyUiLanguagePreference on every initFirebase state path"
    );
});

test("staff login skips Firestore init for superadmin", () => {
    const login = readFileSync(join(root, "js/auth/login-dispatcher.js"), "utf8");
    assert.match(login, /role === "superadmin"/);
    assert.match(login, /Super Admin has no tenant/i);
    const saBranch = login.slice(login.indexOf('role === "superadmin"'));
    const beforeReturn = saBranch.slice(0, saBranch.indexOf("return;"));
    assert.doesNotMatch(beforeReturn, /initFirebase|checkCompanyLicense/);
});

test("shell-staff reapplies UI language before rendering SA dashboard", () => {
    const shell = readFileSync(join(root, "js/layout/shell-staff.js"), "utf8");
    assert.match(shell, /applyUiLanguagePreference/);
    assert.ok(
        shell.indexOf("applyUiLanguagePreference") < shell.indexOf('role === "superadmin"'),
        "language must be restored before SA-specific rendering"
    );
});

test("t()/translateUI resolve language via resolveUiLanguage", () => {
    const i18n = readFileSync(join(root, "js/ui/i18n.js"), "utf8");
    assert.match(i18n, /import \{[^}]*resolveUiLanguage/);
    assert.match(i18n, /const lang = resolveUiLanguage\(\);/);
    assert.equal([...i18n.matchAll(/window\.state\.language\s*\|\|\s*"en"/g)].length, 0);
});
