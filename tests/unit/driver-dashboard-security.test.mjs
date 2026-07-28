import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const source = await readFile(new URL("../../js/driver/dashboard.js", import.meta.url), "utf8");

test("driver dashboard tolerates missing route, stops and report fields", () => {
    assert.match(source, /Array\.isArray\(window\.state\.routes\)/);
    assert.match(source, /routes\[0\] \|\| null/);
    assert.match(source, /renderStopsTimeline\(route\?\.stops\)/);
    assert.match(source, /Array\.isArray\(window\.state\.reports\)/);
    assert.match(source, /String\(r\.type \|\| ""\)/);
    assert.match(source, /if \(!route \|\| !Array\.isArray\(route\.stops\)/);
});

test("route stops are rendered as keyboard controls without innerHTML interpolation", () => {
    assert.match(source, /button\.type = "button"/);
    assert.match(source, /button\.addEventListener\("click"/);
    assert.match(source, /button\.setAttribute\("aria-label"/);
    assert.match(source, /name\.textContent = String\(stop\)/);
    assert.doesNotMatch(source, /<span class="stop-name">\$\{stop\}<\/span>/);
});
