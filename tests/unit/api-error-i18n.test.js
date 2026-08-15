const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "../..");

function pinLoginSlice(authClientSource) {
  const start = authClientSource.indexOf("async function loginWithDriverCode");
  const end = authClientSource.indexOf("async function activatePersonalLoginCode", start);
  assert.ok(start > -1 && end > start, "loginWithDriverCode missing");
  return authClientSource.slice(start, end);
}

test("driver auth API errors expose stable codes (not locale-only)", () => {
  const source = fs.readFileSync(path.join(ROOT, "server/driver-routes.js"), "utf8");
  assert.match(source, /code:\s*"INVALID_LOGIN"/);
  assert.match(source, /code:\s*"INVALID_LOGIN_PAYLOAD"/);
  assert.match(source, /code:\s*"ACCOUNT_LOCKED"/);
  assert.match(source, /code:\s*"COMPANY_SUSPENDED"/);
  assert.match(source, /code:\s*"INVALID_TOKEN"/);
  assert.match(source, /code:\s*"ACTIVATION_REQUIRED"/);
});

test("driver login UI never toasts raw Serbian server error strings", () => {
  const loginDriver = fs.readFileSync(path.join(ROOT, "js/auth/login-driver.js"), "utf8");
  assert.match(loginDriver, /translateApiError/);
  assert.doesNotMatch(loginDriver, /showToast\(\s*result\.error/);
  assert.doesNotMatch(loginDriver, /Pristup firmi je suspendovan/);
  assert.doesNotMatch(loginDriver, /Nevažeći podaci/);
  assert.doesNotMatch(loginDriver, /Unesite EID/);

  const pinLogin = pinLoginSlice(fs.readFileSync(path.join(ROOT, "js/core/auth-client.js"), "utf8"));
  assert.match(pinLogin, /code:\s*"MISSING_FIELDS"/);
  assert.match(pinLogin, /code:\s*data\.code\s*\|\|\s*"INVALID_LOGIN"/);
  assert.doesNotMatch(pinLogin, /Popunite sva polja/);
  assert.doesNotMatch(pinLogin, /Greška pri prijavi/);
  assert.doesNotMatch(pinLogin, /Serverska greška/);
});

test("api_error_* keys exist for en/sr/de", () => {
  const source = fs.readFileSync(path.join(ROOT, "translations.js"), "utf8");
  for (const code of [
    "INVALID_DATA",
    "INVALID_LOGIN",
    "INVALID_TOKEN",
    "ACCOUNT_LOCKED",
    "COMPANY_SUSPENDED",
    "SESSION_SUPERSEDED",
    "MISSING_FIELDS",
    "SERVER_ERROR"
  ]) {
    assert.match(source, new RegExp(`api_error_${code}\\s*:`));
  }
});

test("translateApiError maps code to active language, never raw server Serbian", async () => {
  globalThis.window = {
    state: { language: "en" },
    TRANSLATIONS: {
      en: {
        js_invalid_pin: "Invalid PIN! Please try again.",
        api_error_INVALID_DATA: "Invalid data.",
        api_error_INVALID_LOGIN: "Wrong code or driver not found.",
        api_error_INVALID_TOKEN: "Invalid token."
      },
      sr: {
        js_invalid_pin: "Neispravan PIN!",
        api_error_INVALID_DATA: "Nevažeći podaci.",
        api_error_INVALID_LOGIN: "Pogrešan kod ili vozač nije pronađen.",
        api_error_INVALID_TOKEN: "Nevažeći token."
      },
      de: {
        js_invalid_pin: "Ungültiger PIN!",
        api_error_INVALID_DATA: "Ungültige Daten.",
        api_error_INVALID_LOGIN: "Falscher Code oder Fahrer nicht gefunden.",
        api_error_INVALID_TOKEN: "Ungültiges Token."
      }
    }
  };

  const mod = await import(pathToFileURL(path.join(ROOT, "js/auth/api-error-i18n.js")).href);
  const { translateApiError } = mod;

  assert.equal(translateApiError({ code: "INVALID_DATA", error: "Nevažeći podaci." }), "Invalid data.");
  assert.equal(translateApiError({ code: "INVALID_LOGIN", error: "Pogrešan kod ili vozač nije pronađen." }), "Wrong code or driver not found.");
  assert.equal(translateApiError({ code: "INVALID_TOKEN", error: "Nevažeći token." }), "Invalid token.");

  window.state.language = "de";
  assert.equal(translateApiError({ code: "INVALID_DATA", error: "Nevažeći podaci." }), "Ungültige Daten.");
  assert.doesNotMatch(translateApiError({ code: "INVALID_LOGIN", error: "Pogrešan kod." }), /Pogrešan|Nevažeći/);

  window.state.language = "en";
  assert.equal(translateApiError({ error: "Nevažeći podaci." }), "Invalid PIN! Please try again.");
});
