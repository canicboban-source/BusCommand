import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const source = await readFile(new URL("../../js/data/drivers.js", import.meta.url), "utf8");

test("driver list escapes user-controlled values rendered through innerHTML", () => {
    for (const expression of [
        "escapeHtml(driverName)",
        "escapeHtml(d.companyId || \"N/A\")",
        "escapeHtml(grp.name)",
        "escapeHtml(d.phone || t(\"no_phone\"))",
        "escapeHtml(d.email || t(\"no_email\"))"
    ]) {
        assert.ok(source.includes(expression), `missing safe rendering: ${expression}`);
    }
    assert.doesNotMatch(source, /\$\{d\.(?:name|companyId|phone|email)\}/);
    assert.match(source, /\^#\[0-9a-f\]\{6\}\$/i);
    assert.match(source, /d\.name \|\| \[d\.firstName, d\.lastName\]/);
});

test("production status control follows the company-admin permission", () => {
    assert.match(source, /USE_LOCAL_STATE \|\| window\.currentUser\?\.role === "company-admin"/);
    assert.match(source, /canDeleteDrivers \? `<button class="btn-delete-item"/);
    assert.match(source, /actionAttr\("toggleDriverActive"/);
    assert.doesNotMatch(source, /window\.state\.drivers = window\.state\.drivers\.filter/);
    assert.match(source, /aria-label=/);
    assert.match(source, /title=/);
});

test("driver status uses the authenticated server API outside demo mode", () => {
    assert.match(source, /ApiClient\.setDriverActive\(id, nextActive\)/);
    assert.match(source, /if \(USE_LOCAL_STATE\) saveState\(\)/);
});

test("manual driver create and edit stay demo-only", () => {
    assert.match(source, /function addDriver\(event\) \{[\s\S]*?if \(!USE_LOCAL_STATE\) return;/);
    assert.match(source, /function editDriver\(id\) \{[\s\S]*?if \(!USE_LOCAL_STATE\) return;/);
    assert.match(source, /function importDriversBulk\(\) \{[\s\S]*?if \(!USE_LOCAL_STATE\) return;/);
});
