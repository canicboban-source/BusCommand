import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("driver first login uses a masked custom activation modal and no native prompt", () => {
  const html = read("driver.html");
  const auth = read("js/core/auth-client.js");
  const activation = read("js/auth/driver-activation.js");

  assert.match(html, /id="driver-activation-modal"[^>]*role="dialog"/);
  assert.match(html, /id="driver-activation-code"\s+type="password"/);
  assert.match(html, /id="driver-activation-code-confirm"/);
  assert.doesNotMatch(html, /id="driver-activation-code"[^>]*\svalue=/);
  assert.doesNotMatch(`${auth}\n${activation}`, /window\.(?:prompt|alert|confirm)\s*\(/);
  assert.match(activation, /clearActivationInput\(\);\s*const requestId/);
  const submit = activation.slice(activation.indexOf("async function submitDriverActivation"));
  assert.doesNotMatch(submit, /localStorage|sessionStorage|window\.state|console\./);
  assert.match(submit, /activatePersonalLoginCode/);
});

test("pending activation cannot initialize the dashboard and cancel signs out", () => {
  const login = read("js/auth/login-driver.js");
  const activation = read("js/auth/driver-activation.js");
  const pendingBranch = login.slice(login.indexOf("if (result.requiresActivation)"), login.indexOf("async function _completeDriverProductionLogin"));

  assert.match(pendingBranch, /openDriverActivation/);
  assert.doesNotMatch(pendingBranch, /initFirebase|persistUserSession|showAppLayout/);
  assert.match(activation, /async function cancelDriverActivation[\s\S]*await Auth\.logout\(\)/);
  assert.match(activation, /window\.currentUser = null/);
  assert.match(activation, /clearUserSession\(\)/);
  assert.match(activation, /resetInMemoryTenantState\(/);
  assert.match(activation, /clearDriverFileInputs\(\)/);
});

test("Escape, backdrop close and browser Back all cancel pending activation", () => {
  const activation = read("js/auth/driver-activation.js");
  assert.match(activation, /event\.key === "Escape"[\s\S]*cancelDriverActivation\(\)/);
  assert.match(activation, /event\.target\?\.id === "driver-activation-modal"[\s\S]*cancelDriverActivation\(\)/);
  assert.match(activation, /addEventListener\("popstate"[\s\S]*cancelDriverActivation\(\)/);
});

test("all operational UI roots and action handlers are gated while activation is pending", () => {
  const gate = read("js/auth/driver-access-gate.js");
  const navigation = read("js/layout/navigation.js");
  const shell = read("js/layout/shell-driver.js");
  const pretrip = read("js/layout/pretrip.js");
  const delegate = read("js/core/action-delegate.js");
  const registry = read("js/register-onclick-driver.js");
  for (const marker of ["app-container", "pre-trip-modal", "mobile-bottom-nav", "fp-mobile-nav"]) {
    assert.match(gate, new RegExp(`"${marker}"`));
  }
  assert.match(gate, /replaceChild\(placeholder, node\)/);
  assert.match(navigation, /if \(!canUseDriverOperationalUi\(\)\) return false/);
  assert.match(shell, /if \(!canUseDriverOperationalUi\(\)\) return false/);
  assert.match(pretrip, /if \(!canUseDriverOperationalUi\(\)\) return false/);
  assert.match(delegate, /if \(!canInvokeActionDuringDriverActivation\(name\)\) return false/);
  assert.match(registry, /canInvokeActionDuringDriverActivation\(name\) \? fn\(\.\.\.args\) : false/);
  assert.match(registry, /import \{ cancelDriverActivation, openDriverActivation, submitDriverActivation \}/);
  assert.match(gate, /"openDriverActivation"/);
});

test("hard refresh pending callback cannot load cloud, offline state or driver shell", () => {
  const bootstrap = read("js/bootstrap/init.js");
  const pending = bootstrap.slice(bootstrap.indexOf("onActivationRequired:"), bootstrap.indexOf("onAuthenticated:"));
  assert.match(pending, /clearUserSession\(\)/);
  assert.match(pending, /openDriverActivation\(\)/);
  assert.doesNotMatch(pending, /initFirebase|checkCompanyLicense|loadStateFromStorage|persistUserSession|showAppLayout/);
});

test("activation refreshes the Firebase token and fails closed", () => {
  const auth = read("js/core/auth-client.js");
  const activate = auth.slice(auth.indexOf("async function activatePersonalLoginCode"), auth.indexOf("async function logout"));

  assert.match(activate, /getIdToken\(true\)/);
  assert.match(activate, /activate-personal-code/);
  assert.match(activate, /signInWithCustomToken\(data\.token\)/);
  assert.match(activate, /getIdTokenResult\(true\)/);
  assert.match(activate, /mustChangeLoginCode === true[\s\S]*signOut/);
  assert.doesNotMatch(activate, /console\.|data\.error|companyCodeHash|loginCodeHash/);
});

test("driver activation translations are complete and language-specific", () => {
  const source = read("translations.js");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const keys = [
    "driver_login_code_label", "driver_activation_title", "driver_activation_explanation",
    "driver_activation_field", "driver_activation_confirm_field", "driver_activation_mismatch",
    "driver_activation_activate", "driver_activation_loading",
    "driver_activation_error", "btn_cancel"
  ];
  for (const language of ["en", "de", "sr"]) {
    for (const key of keys) assert.ok(context.window.TRANSLATIONS[language][key], `${language}.${key}`);
  }
  assert.equal(context.window.TRANSLATIONS.en.driver_login_code_label, "Login code");
  assert.equal(context.window.TRANSLATIONS.de.driver_login_code_label, "Anmeldecode");
  assert.equal(context.window.TRANSLATIONS.sr.driver_login_code_label, "Kod za prijavu");
});

test("production source has no Reset App control or direct reset handler", () => {
  const html = read("index.html");
  const registry = read("js/register-onclick.js");
  const modals = read("js/ui/modals.js");
  assert.doesNotMatch(html, /Reset App|data-action="resetApp"/);
  assert.doesNotMatch(registry, /\bresetApp\b/);
  assert.doesNotMatch(modals, /function resetApp\s*\(/);
});

test("duty checklist keeps exactly the first four checks and optional damage upload", () => {
  const html = read("driver.html");
  const form = html.slice(html.indexOf('id="pre-trip-form"'), html.indexOf("</form>", html.indexOf('id="pre-trip-form"')));
  assert.equal((form.match(/type="checkbox"/g) || []).length, 4);
  for (const name of ["pt1", "pt2", "pt3", "pt4"]) assert.match(form, new RegExp(`name="${name}"`));
  assert.doesNotMatch(form, /name="pt[5-9]"|pretrip_check_[5-9]/);
  assert.match(form, /<input[^>]*type="file"[^>]*id="pre-trip-damage-file"/);
  assert.match(form, /type="submit"/);
});
