import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const dashboard = await readFile(new URL("../../js/driver/dashboard.js", import.meta.url), "utf8");
const driverHtml = await readFile(new URL("../../driver.html", import.meta.url), "utf8");
const monolith = await readFile(new URL("../../index.legacy-monolith.html", import.meta.url), "utf8");
const registerDriver = await readFile(new URL("../../js/register-onclick-driver.js", import.meta.url), "utf8");

test("D26: SOS holds for a full 2s and asks no confirmation question", () => {
    assert.match(dashboard, /const SOS_HOLD_MS = 2000;/);
    // The whole point of the anti-panic control: no dialog between driver and dispatcher.
    assert.doesNotMatch(dashboard, /sos-trigger-modal/);
    assert.doesNotMatch(dashboard, /confirmSOSTrigger/);
    assert.doesNotMatch(dashboard, /triggerSOSAlert/);
    assert.match(dashboard, /async function sendDriverSosNow\(\)/);
    assert.match(dashboard, /sosHapticFeedback\(\);\s*\n\s*sendDriverSosNow\(\);/);
});

test("D26: releasing early aborts the hold and sends nothing", () => {
    for (const evt of ["pointerup", "pointerleave", "pointercancel", "blur"]) {
        assert.match(dashboard, new RegExp(`addEventListener\\("${evt}"`), `${evt} must cancel the hold`);
    }
    assert.match(dashboard, /const endHold = \(\) => clearSosHold\(btn\);/);
    assert.match(dashboard, /sosHoldActive = false;/);
    // A cancelled hold must not leave a half-filled ring behind.
    assert.match(dashboard, /progress\.style\.setProperty\("--sos-hold-ratio", "0"\)/);
});

test("D26: keyboard mirrors the hold instead of firing instantly", () => {
    assert.match(dashboard, /addEventListener\("keydown"/);
    assert.match(dashboard, /addEventListener\("keyup"/);
    assert.match(dashboard, /if \(event\.repeat \|\| sosHoldActive\) return;/);
    // Enter/Space must arm the same timed hold, never call the sender directly.
    assert.doesNotMatch(dashboard, /event\.key === "Enter" \|\| event\.key === " "\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*sendDriverSosNow/);
});

test("D26: haptic feedback is best-effort and never blocks the alarm", () => {
    assert.match(dashboard, /typeof navigator\.vibrate === "function"/);
    assert.match(dashboard, /navigator\.vibrate\(\[100, 50, 100\]\)/);
    assert.match(dashboard, /function sosHapticFeedback\(\)[\s\S]*?try \{[\s\S]*?\} catch/);
});

test("D26: a plain dispatcher call is a separate one-tap action, not SOS", () => {
    assert.match(dashboard, /function callDispatcher\(\)/);
    assert.match(dashboard, /window\.location\.href = `tel:\$\{phone\}`;/);
    // Calling must not touch SOS state.
    const callBody = dashboard.slice(dashboard.indexOf("function callDispatcher()"));
    const callFn = callBody.slice(0, callBody.indexOf("\n}\n") + 2);
    assert.doesNotMatch(callFn, /sosActive|createDriverSos|sendDriverSosNow/);
    assert.match(registerDriver, /callDispatcher/);
});

test("D26: the call button only appears once a valid E.164 dispatch line exists", () => {
    assert.match(dashboard, /window\.state\?\.profile\?\.dispatchPhone/);
    assert.match(dashboard, /\/\^\\\+\[1-9\]\\d\{6,14\}\$\//);
    assert.match(dashboard, /btn\.classList\.toggle\("hidden", !dispatchPhoneNumber\(\)\)/);
    for (const html of [driverHtml, monolith]) {
        assert.match(html, /id="driver-call-dispatcher"[^>]*class="driver-pwa-callbtn hidden"/);
        assert.match(html, /id="driver-call-dispatcher"[^>]*data-action="callDispatcher"/);
    }
});

test("D26: SOS button no longer wears a telephone icon", () => {
    for (const html of [driverHtml, monolith]) {
        const sosButton = html.slice(html.indexOf('id="mobnav-sos"'));
        const markup = sosButton.slice(0, sosButton.indexOf("</button>"));
        assert.doesNotMatch(markup, /data-lucide="phone/);
        assert.match(markup, /data-lucide="siren"/);
    }
});
