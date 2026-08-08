/**
 * Phase 2: CA header shows package · days badge (amber trial / green active).
 * Login trial chip and Super Admin must never show it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadLicenseHelpers() {
    const badges = {
        login: { className: "trial-badge-login", classList: null, span: { textContent: "" }, attrs: {}, textContent: "" },
        app: { className: "trial-indicator", classList: null, span: { textContent: "" }, attrs: {}, textContent: "" }
    };
    for (const key of ["login", "app"]) {
        const el = badges[key];
        el.classList = {
            add(name) { if (!el.className.split(/\s+/).includes(name)) el.className += ` ${name}`; },
            remove(...names) {
                el.className = el.className.split(/\s+/).filter((c) => c && !names.includes(c)).join(" ");
            },
            toggle(name, force) {
                if (force) el.classList.add(name);
                else el.classList.remove(name);
            },
            contains(name) { return el.className.split(/\s+/).includes(name); }
        };
        el.querySelector = (sel) => (sel === "span" ? el.span : null);
        el.setAttribute = (k, v) => { el.attrs[k] = v; };
        el.removeAttribute = (k) => { delete el.attrs[k]; };
        el.getAttribute = (k) => el.attrs[k];
    }

    const document = {
        getElementById(id) {
            if (id === "login-trial-badge") return badges.login;
            if (id === "app-trial-badge") return badges.app;
            return null;
        },
        body: { prepend() {} },
        createElement() { return { style: {}, id: "", textContent: "" }; }
    };
    const window = { currentUser: null, _licenseInfo: null, t: null };

    const source = readFileSync(join(root, "js/core/license.js"), "utf8")
        .replace(/^import\s+.+?;\r?\n/gm, "")
        .replace(/export\s+\{([^}]+)\};/m, (_, list) => {
            const names = list.split(",").map((s) => s.trim()).filter(Boolean);
            return `module.exports = { ${names.join(", ")} };`;
        });
    const context = {
        document,
        window,
        module: { exports: {} },
        exports: {}
    };
    const wrapped = `
      const USE_LOCAL_STATE = false;
      const ApiClient = { getLicense: async () => ({ success: false }) };
      ${source}
    `;
    vm.runInNewContext(wrapped, context);
    return { api: context.module.exports, window, badges };
}

test("isTrialBadgeRoleAllowed only allows company-admin", () => {
    const { api } = loadLicenseHelpers();
    assert.equal(api.isTrialBadgeRoleAllowed("superadmin"), false);
    assert.equal(api.isTrialBadgeRoleAllowed("dispatcher"), false);
    assert.equal(api.isTrialBadgeRoleAllowed("company-admin"), true);
});

test("updateTrialBadge shows CA package badge during trial", () => {
    const { api, window, badges } = loadLicenseHelpers();
    window.currentUser = { role: "company-admin", companyId: "acme" };
    window._licenseInfo = {
        plan: "pro",
        licenseType: "pro",
        licenseStatus: "trial",
        packageLabel: "PRO",
        daysRemaining: 31,
        status: "active"
    };

    api.updateTrialBadge();

    assert.equal(badges.login.classList.contains("hidden"), true);
    assert.equal(badges.app.classList.contains("hidden"), false);
    assert.ok(badges.app.classList.contains("is-trial"));
    assert.match(badges.app.textContent, /PRO PAKET/);
    assert.match(badges.app.textContent, /31/);
});

test("updateTrialBadge hides chips for Super Admin", () => {
    const { api, window, badges } = loadLicenseHelpers();
    window.currentUser = { role: "superadmin" };
    window._licenseInfo = { plan: "pro", licenseStatus: "trial", daysRemaining: 29, status: "active", packageLabel: "PRO" };
    api.updateTrialBadge();
    assert.ok(badges.app.classList.contains("hidden"));
    assert.ok(badges.login.classList.contains("hidden"));
});

test("staff HTML keeps license badge slot and connection status", () => {
    const staff = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
    const license = readFileSync(join(root, "js/core/license.js"), "utf8");
    const css = readFileSync(join(root, "css/staff-desktop.css"), "utf8");
    assert.match(staff, /id="app-trial-badge"/);
    assert.match(staff, /id="header-connection-status"/);
    assert.match(license, /license-package-badge/);
    assert.match(css, /license-package-badge/);
});
