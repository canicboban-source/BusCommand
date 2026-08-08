/**
 * Live-review #10: trial banner must not show for Super Admin (platform owner).
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
        login: { className: "trial-badge-login hidden", classList: null, span: { textContent: "" }, attrs: {} },
        app: { className: "trial-indicator hidden", classList: null, span: { textContent: "" }, attrs: {} }
    };
    for (const key of ["login", "app"]) {
        const el = badges[key];
        el.classList = {
            add(name) { if (!el.className.split(/\s+/).includes(name)) el.className += " " + name; },
            remove(name) { el.className = el.className.split(/\s+/).filter((c) => c && c !== name).join(" "); },
            toggle(name, force) {
                if (force) el.classList.add(name);
                else el.classList.remove(name);
            },
            contains(name) { return el.className.split(/\s+/).includes(name); }
        };
        el.querySelector = (sel) => (sel === "span" ? el.span : null);
        el.setAttribute = (k, v) => { el.attrs[k] = v; };
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
        exports: {},
        USE_LOCAL_STATE: false,
        ApiClient: { getLicense: async () => ({ success: false }) }
    };
    // Provide bare identifiers used after import strip
    const wrapped = `
      const USE_LOCAL_STATE = false;
      const ApiClient = { getLicense: async () => ({ success: false }) };
      ${source}
    `;
    vm.runInNewContext(wrapped, context);
    return { api: context.module.exports, window, badges };
}

test("isTrialBadgeRoleAllowed rejects superadmin", () => {
    const { api } = loadLicenseHelpers();
    assert.equal(api.isTrialBadgeRoleAllowed("superadmin"), false);
    assert.equal(api.isTrialBadgeRoleAllowed("company-admin"), true);
    assert.equal(api.isTrialBadgeRoleAllowed("dispatcher"), true);
    assert.equal(api.isTrialBadgeRoleAllowed("driver"), true);
});

test("updateTrialBadge hides app and login badges for Super Admin even on trial", () => {
    const { api, window, badges } = loadLicenseHelpers();
    window.currentUser = { role: "superadmin" };
    window._licenseInfo = { plan: "trial", daysRemaining: 29, status: "active" };
    badges.app.classList.remove("hidden");
    badges.login.classList.remove("hidden");

    api.updateTrialBadge();

    assert.ok(badges.app.classList.contains("hidden"), "app trial badge must be hidden for SA");
    assert.ok(badges.login.classList.contains("hidden"), "login trial badge must be hidden for SA");
    assert.equal(badges.app.attrs["aria-hidden"], "true");
});

test("updateTrialBadge shows app badge for company-admin on trial", () => {
    const { api, window, badges } = loadLicenseHelpers();
    window.currentUser = { role: "company-admin", companyId: "acme" };
    window._licenseInfo = { plan: "trial", daysRemaining: 12, status: "active" };

    api.updateTrialBadge();

    assert.equal(badges.app.classList.contains("hidden"), false);
    assert.match(badges.app.span.textContent, /12/);
});

test("updateTrialBadge hides app badge when plan is not trial", () => {
    const { api, window, badges } = loadLicenseHelpers();
    window.currentUser = { role: "company-admin" };
    window._licenseInfo = { plan: "paid", daysRemaining: 0, status: "active" };
    badges.app.classList.remove("hidden");

    api.updateTrialBadge();

    assert.ok(badges.app.classList.contains("hidden"));
});

test("staff shell and HTML hide SA trial by default", () => {
    const shell = readFileSync(join(root, "js/layout/shell-staff.js"), "utf8");
    const staff = readFileSync(join(root, "staff.html"), "utf8");
    const license = readFileSync(join(root, "js/core/license.js"), "utf8");
    assert.match(shell, /updateTrialBadge/);
    assert.match(license, /superadmin/);
    assert.match(staff, /id="app-trial-badge"/);
    assert.match(staff, /class="trial-indicator hidden"/);
});
