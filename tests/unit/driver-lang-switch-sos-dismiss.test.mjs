import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const driverHtml = await readFile(new URL("../../driver.html", import.meta.url), "utf8");
const staffHtml = await readFile(new URL("../../staff.html", import.meta.url), "utf8");
const monolith = await readFile(new URL("../../index.legacy-monolith.html", import.meta.url), "utf8");
const modals = await readFile(new URL("../../js/ui/modals.js", import.meta.url), "utf8");
const siren = await readFile(new URL("../../js/maps/sos-siren.js", import.meta.url), "utf8");
const state = await readFile(new URL("../../js/core/state.js", import.meta.url), "utf8");
const driverCss = await readFile(new URL("../../css/driver-pwa.css", import.meta.url), "utf8");
const apiClient = await readFile(new URL("../../js/core/api-client.js", import.meta.url), "utf8");

test("D28: the driver PWA carries a DE/SR/EN switcher in its own header", () => {
    // #header-lang-select is in the driver DOM but the whole .app-header is
    // display:none on this surface, so it was unreachable once signed in.
    assert.match(driverCss, /\[data-app-surface="driver"\] \.app-header \{\s*\n\s*display: none;/);
    for (const lang of ["de", "sr", "en"]) {
        assert.match(driverHtml, new RegExp(`class="driver-pwa-lang" data-lang="${lang}"`));
        assert.match(driverHtml, new RegExp(`data-action-args='\\["${lang}"\\]'`));
    }
    assert.match(driverHtml, /class="driver-pwa-langswitch"[^>]*role="group"/);
});

test("D28: the active language is reflected on the switcher and persisted", () => {
    assert.match(state, /localStorage\.setItem\("buscommand_lang", lang\)/);
    assert.match(state, /querySelectorAll\("\.driver-pwa-lang"\)/);
    assert.match(state, /btn\.classList\.toggle\("is-active", active\)/);
    assert.match(state, /setAttribute\("aria-pressed"/);
});

test("D28: the switcher shrinks instead of pushing the call button off a phone", () => {
    assert.match(driverCss, /\.driver-pwa-langswitch/);
    // Without these the added ~122px silently clipped the call button and avatar.
    assert.match(driverCss, /@media \(max-width: 430px\)[\s\S]{0,400}?\.driver-pwa-userchip-text \{\s*\n\s*display: none;/);
    assert.match(driverCss, /@media \(max-width: 380px\)[\s\S]{0,300}?\.bc-brand-text \{\s*\n\s*display: none;/);
});

test("D28: the SOS dismiss note is optional and never blocks the operator", () => {
    assert.match(modals, /function readSosResolutionNote\(\)/);
    // No required/validation gate on the field.
    assert.doesNotMatch(modals, /sos-resolve-note[\s\S]{0,200}?required/);
    for (const html of [staffHtml, monolith]) {
        assert.match(html, /id="sos-resolve-note"/);
        assert.match(html, /for="sos-resolve-note"[^>]*[\s\S]{0,120}?data-i18n="sos_resolve_note_label"/);
        assert.doesNotMatch(html, /id="sos-resolve-note"[^>]*\srequired/);
    }
});

test("D28: the previously empty driver-info box is filled or hidden", () => {
    // It was dead markup nothing ever wrote to, so it rendered as an unlabelled box.
    assert.match(modals, /function renderSosConfirmContext\(\)/);
    assert.match(modals, /info\.hidden = parts\.length === 0/);
    assert.match(modals, /if \(id === "sos-confirm-modal"\) renderSosConfirmContext\(\);/);
    for (const html of [staffHtml, monolith]) {
        assert.match(html, /id="sos-confirm-driver-info" hidden/);
    }
});

test("D28: confirming silences the siren immediately, before the round trip", () => {
    const start = siren.indexOf("sosResolvePending = true;");
    assert.notEqual(start, -1);
    const body = siren.slice(start, start + 400);
    assert.match(body, /stopSOSSiren\(\);/);
    // If the server rejects, the finally block restarts it because sosActive is still true.
    assert.match(siren, /} finally \{[\s\S]{0,160}?checkSOSStatus\(\);/);
});

test("D28: the note travels from the dialog to the API", () => {
    assert.match(modals, /const note = readSosResolutionNote\(\);[\s\S]{0,160}?resolveSOS\(note\)/);
    assert.match(siren, /async function resolveSOS\(note = ""\)/);
    assert.match(siren, /ApiClient\.resolveStaffSos\(note\)/);
    assert.match(apiClient, /async function resolveStaffSos\(note = ""\)/);
    assert.match(apiClient, /JSON\.stringify\(\{ note: String\(note \|\| ""\)\.trim\(\)\.slice\(0, 500\) \}\)/);
});
