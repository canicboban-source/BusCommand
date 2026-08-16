import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const tokens = await readFile(new URL("../../css/design-tokens.css", import.meta.url), "utf8");
const staffCss = await readFile(new URL("../../css/staff-desktop.css", import.meta.url), "utf8");
const driverCss = await readFile(new URL("../../css/driver-pwa.css", import.meta.url), "utf8");
const styleCss = await readFile(new URL("../../style.css", import.meta.url), "utf8");

function lightThemeBlock() {
    const start = tokens.indexOf("body.light-theme {");
    assert.notEqual(start, -1, "body.light-theme block must exist in design-tokens.css");
    return tokens.slice(start, tokens.indexOf("}", start));
}

function hexToRgb(hex) {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}

/** WCAG 2.x relative luminance + contrast ratio. */
function contrastRatio(foreground, background) {
    const channel = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const lum = (hex) => {
        const [r, g, b] = hexToRgb(hex).map(channel);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(foreground);
    const b = lum(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function tokenValue(block, name) {
    const match = block.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{3,8})`));
    return match ? match[1] : null;
}

test("light theme redefines every semantic status token", () => {
    const block = lightThemeBlock();
    // Without these the dark-tuned values (e.g. #4ADE80) survive onto a white panel
    // and every token-driven pill, chip and row tint silently drops to ~1.7:1.
    for (const token of [
        "--success-color", "--warning-color", "--danger-color", "--blue-color",
        "--success-bg", "--warning-bg", "--danger-bg",
        "--success-strong", "--warning-strong", "--danger-strong",
        "--info-violet", "--accent-color"
    ]) {
        assert.ok(block.includes(`${token}:`), `light theme must redefine ${token}`);
    }
});

test("light theme redefines the surface and text tokens", () => {
    const block = lightThemeBlock();
    for (const token of [
        "--bg-dark", "--bg-darker", "--panel-bg", "--panel-bg-solid", "--card-bg",
        "--panel-border", "--text-main", "--text-secondary", "--text-muted"
    ]) {
        assert.ok(block.includes(`${token}:`), `light theme must redefine ${token}`);
    }
});

test("light-theme status colours clear WCAG AA on the light panel", () => {
    const block = lightThemeBlock();
    const panel = tokenValue(block, "--panel-bg-solid") || "#FFFFFF";
    for (const token of ["--success-color", "--warning-color", "--danger-color", "--blue-color", "--text-main", "--text-secondary"]) {
        const value = tokenValue(block, token);
        assert.ok(value, `${token} must be a hex value in the light block`);
        const ratio = contrastRatio(value, panel);
        assert.ok(ratio >= 4.5, `${token} (${value}) on ${panel} is ${ratio.toFixed(2)}:1, below AA 4.5:1`);
    }
});

test("dark status colours still clear AA on the dark panel", () => {
    const root = tokens.slice(tokens.indexOf(":root"), tokens.indexOf("body.light-theme {"));
    const panel = tokenValue(root, "--card-bg") || "#141D2E";
    for (const token of ["--success-color", "--warning-color", "--danger-color", "--text-main"]) {
        const value = tokenValue(root, token);
        if (!value) continue;
        const ratio = contrastRatio(value, panel);
        assert.ok(ratio >= 4.5, `dark ${token} (${value}) on ${panel} is ${ratio.toFixed(2)}:1, below AA 4.5:1`);
    }
});

test("the primary CTA uses the on-accent colour, never the body text colour", () => {
    // In light theme --text-main is near-black; on the blue fill that is ~2.7:1.
    assert.match(styleCss, /\.btn-primary \{[\s\S]{0,320}?color: var\(--text-on-accent\)/);
    assert.doesNotMatch(styleCss, /\.btn-primary \{\s*\n\s*background: var\(--primary-color\);\s*\n\s*color: var\(--text-main\);/);
});

test("surface-scoped stylesheets carry light-theme overrides", () => {
    // staff-desktop.css and driver-pwa.css are dark-first and token-blind; without a
    // light block their literal greys stay on the white panel.
    assert.ok(staffCss.includes("body.light-theme"), "staff-desktop.css needs light-theme overrides");
    assert.ok(driverCss.includes("body.light-theme"), "driver-pwa.css needs light-theme overrides");
});

test("no stylesheet relies on the undefined --bc-text / --bc-accent fallbacks", () => {
    // These were never declared, so the #1a1a1a fallback always won — dark text on a
    // dark panel in the DEFAULT theme.
    for (const [name, css] of [["staff-desktop.css", staffCss], ["style.css", styleCss], ["driver-pwa.css", driverCss]]) {
        assert.doesNotMatch(css, /var\(--bc-text,/, `${name} must not fall back to a hardcoded --bc-text`);
        assert.doesNotMatch(css, /var\(--bc-accent,/, `${name} must not fall back to a hardcoded --bc-accent`);
    }
});

test("shared panel surfaces follow the theme instead of a hardcoded dark hex", () => {
    for (const selector of [".card", ".panel", ".toast", ".dispatcher-stat-card"]) {
        const start = styleCss.indexOf(`${selector} {`);
        assert.notEqual(start, -1, `${selector} rule must exist`);
        const body = styleCss.slice(start, styleCss.indexOf("}", start));
        assert.doesNotMatch(body, /background:\s*#[0-9a-fA-F]{6}/, `${selector} must not hardcode a dark background`);
    }
});
