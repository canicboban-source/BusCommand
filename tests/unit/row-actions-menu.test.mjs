import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("CA groups and team route destructive delete through row-actions menu + confirm", () => {
    const groups = readFileSync(join(root, "js/admin/company-admin-groups.js"), "utf8");
    const team = readFileSync(join(root, "js/admin/company-admin-team.js"), "utf8");
    const registry = readFileSync(join(root, "js/register-onclick-staff.js"), "utf8");
    assert.match(groups, /rowActionsMenuHtml/);
    assert.match(groups, /deleteCompanyGroup/);
    assert.match(groups, /showConfirm/);
    assert.match(groups, /btn_yes/);
    assert.doesNotMatch(groups, /btn-danger-ghost"[^>]*deleteCompanyGroup/);
    assert.match(team, /rowActionsMenuHtml/);
    assert.match(team, /removeCompanyDispatcher/);
    assert.match(team, /showConfirm/);
    assert.match(registry, /toggleRowActionsMenu/);
});

test("driver bottom nav order keeps SOS as center slot", () => {
    const html = readFileSync(join(root, "driver.html"), "utf8");
    const css = readFileSync(join(root, "css/driver-pwa.css"), "utf8");
    const nav = html.match(/id="mobile-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
    const order = [...nav.matchAll(/id="(mobnav-[a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(order, [
        "mobnav-dashboard",
        "mobnav-calendar",
        "mobnav-sos",
        "mobnav-reports",
        "mobnav-messages"
    ]);
    assert.match(css, /translateY\(-16px\)/);
    assert.match(css, /flex:\s*0 0 64px/);
});
