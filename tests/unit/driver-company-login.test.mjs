/**
 * Recheck #1: driver login must send a real companyId (not null from bare driver.html).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadDriverCompany({ companyId = null, isDemo = false, remembered = null } = {}) {
    const map = new Map();
    if (remembered) map.set("buscommand_last_driver_company", remembered);
    const localStorage = {
        getItem(k) { return map.has(k) ? map.get(k) : null; },
        setItem(k, v) { map.set(String(k), String(v)); },
        removeItem(k) { map.delete(k); }
    };
    const source = readFileSync(join(root, "js/auth/driver-company.js"), "utf8")
        .replace(/^import\s+.+?;\r?\n/gm, "")
        .replace(/export\s+\{([^}]+)\};/m, (_, list) => {
            const names = list.split(",").map((s) => s.trim()).filter(Boolean);
            return `module.exports = { ${names.join(", ")} };`;
        });
    const wrapped = `
      const COMPANY_ID = ${JSON.stringify(companyId)};
      const IS_DEMO_MODE = ${isDemo ? "true" : "false"};
      const STORAGE = { LAST_DRIVER_COMPANY: "buscommand_last_driver_company" };
      ${source}
    `;
    const context = { module: { exports: {} }, exports: {}, localStorage };
    vm.runInNewContext(wrapped, context);
    return { api: context.module.exports, localStorage: map };
}

test("normalizeCompanyId rejects empty and reserved project id", () => {
    const { api } = loadDriverCompany();
    assert.equal(api.normalizeCompanyId(""), null);
    assert.equal(api.normalizeCompanyId("buscommand-preview"), null);
    assert.equal(api.normalizeCompanyId("QA-Recheck GmbH"), null);
    assert.equal(api.normalizeCompanyId("qa-recheck-gmbh"), "qa-recheck-gmbh");
});

test("resolveDriverLoginCompanyId prefers typed field over URL and memory", () => {
    const { api } = loadDriverCompany({ companyId: "from-url", remembered: "from-memory" });
    assert.equal(api.resolveDriverLoginCompanyId("typed-co"), "typed-co");
    assert.equal(api.resolveDriverLoginCompanyId(""), "from-url");
});

test("resolveDriverLoginCompanyId falls back to remembered when URL missing", () => {
    const { api } = loadDriverCompany({ companyId: null, remembered: "saved-co" });
    assert.equal(api.resolveDriverLoginCompanyId(""), "saved-co");
    assert.equal(api.resolveDriverLoginCompanyId(null), "saved-co");
});

test("bare driver.html would previously send null — now resolution fails closed without input", () => {
    const { api } = loadDriverCompany({ companyId: null, remembered: null });
    assert.equal(api.resolveDriverLoginCompanyId(""), null);
});

test("driverPortalUrl embeds company for SMS deep link", () => {
    const { api } = loadDriverCompany();
    assert.equal(api.driverPortalUrl("qa-recheck-gmbh"), "/driver.html?company=qa-recheck-gmbh");
    assert.equal(api.driverPortalUrl(""), "/driver.html");
});

test("login-driver identify body uses resolved companyId variable not bare COMPANY_ID only", () => {
    const login = readFileSync(join(root, "js/auth/login-driver.js"), "utf8");
    assert.match(login, /resolveDriverLoginCompanyId/);
    assert.match(login, /JSON\.stringify\(\{\s*companyId,\s*eid\s*\}\)/);
    assert.doesNotMatch(login, /companyId:\s*COMPANY_ID/);
    assert.match(login, /login_company_required_toast/);
});

test("driver.html exposes company ID field", () => {
    const html = readFileSync(join(root, "driver.html"), "utf8");
    assert.match(html, /id="login-driver-company"/);
    assert.match(html, /data-i18n="login_company_label"/);
});

test("SMS activation portalUrl includes ?company=", () => {
    const routes = readFileSync(join(root, "server/driver-routes.js"), "utf8");
    assert.match(routes, /portalUrl:\s*`\/driver\.html\?company=\$\{encodeURIComponent\(/);
    assert.equal([...routes.matchAll(/portalUrl:\s*"\/driver\.html"/g)].length, 0);
});

test("CA driver import hint is translated and describes secure SMS activation", () => {
    const tr = readFileSync(join(root, "translations.js"), "utf8");
    assert.match(tr, /eid, first_name, last_name, phone, email, company_code/);
    assert.match(tr, /buses are entered manually per group/);
    assert.match(tr, /Busse werden manuell pro Gruppe erfasst/);
    assert.match(tr, /buseve unosite ručno po grupi/);
    assert.match(tr, /one-time six-digit activation code and sends it by SMS/);
    assert.match(tr, /einmaligen sechsstelligen Aktivierungscode und sendet ihn per SMS/);
});

test("CA wizard placeholders are i18n keys not hard Serbian", () => {
    const staff = readFileSync(join(root, "staff.html"), "utf8");
    assert.match(staff, /id="ca-wizard-group-name"[^>]*data-i18n-placeholder="ca_wizard_ph_group_name"/);
    assert.match(staff, /id="ca-wizard-disp-name"[^>]*data-i18n-placeholder="ca_wizard_ph_disp_name"/);
    const wizardGroup = staff.match(/id="ca-wizard-group-name"[^>]*>/);
    const wizardDisp = staff.match(/id="ca-wizard-disp-name"[^>]*>/);
    assert.ok(wizardGroup);
    assert.ok(wizardDisp);
    assert.doesNotMatch(wizardGroup[0], /Linija 310|Marko/);
    assert.doesNotMatch(wizardDisp[0], /Linija 310|Marko|Dispečer/);
});
