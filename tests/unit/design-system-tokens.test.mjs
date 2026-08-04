import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const tokens = readFileSync(join(root, "css/design-tokens.css"), "utf8");
const staff = readFileSync(join(root, "css/staff-desktop.css"), "utf8");
const driver = readFileSync(join(root, "css/driver-pwa.css"), "utf8");
const style = readFileSync(join(root, "style.css"), "utf8");

const REQUIRED_ROOT = [
  "--urgent-action:",
  "--urgent-action-hover:",
  "--urgent-action-border:",
  "--urgent-action-fg:",
  "--urgent-action-rgb:",
  "--state-disabled-opacity:",
  "--state-loading-opacity:",
  "--font-family-sans:",
  "--font-size-xs:",
  "--font-size-xl:",
  "--space-1:",
  "--space-12:",
  "--density-page-pad-y:",
  "--density-control-h:",
  "--z-ops-modal:",
  "--z-skip-link:",
  "--text-on-urgent:"
];

test("design tokens declare the §33 catalogue", () => {
  for (const name of REQUIRED_ROOT) {
    assert.match(tokens, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${name}`);
  }
  assert.match(tokens, /html\[data-app-surface="staff"\]\s*\{[\s\S]*--density-page-pad-y:/);
  assert.match(tokens, /html\[data-app-surface="driver"\]\s*\{[\s\S]*--density-control-h:/);
  assert.match(tokens, /body\.light-theme\s*\{[\s\S]*--urgent-action:/);
});

test("staff urgent-action and density consume tokens, not raw amber hex", () => {
  assert.match(staff, /\.urgent-action\s*\{[\s\S]*background:\s*var\(--urgent-action\)/);
  assert.match(staff, /\.urgent-action:hover:not\(:disabled\)\s*\{[\s\S]*background:\s*var\(--urgent-action-hover\)/);
  assert.match(staff, /\.urgent-action:disabled\s*\{[\s\S]*opacity:\s*var\(--state-disabled-opacity\)/);
  assert.match(staff, /\.ops-modal-layer\s*\{[\s\S]*z-index:\s*var\(--z-ops-modal\)/);
  assert.match(staff, /padding:\s*var\(--density-page-pad-y\)\s+var\(--density-page-pad-x\)\s+var\(--density-page-pad-bottom\)/);
  // Raw amber CTA stack must not remain on the urgent button
  assert.doesNotMatch(
    staff,
    /\.urgent-action\s*\{[^}]*background:\s*#f59e0b/i,
    "urgent-action still hardcodes amber fill"
  );
});

test("driver surface page pad uses density tokens", () => {
  assert.match(
    driver,
    /padding:\s*0\s+var\(--density-page-pad-x\)\s+var\(--density-page-pad-bottom\)/
  );
});

test("style.css does not redeclare the light-theme token block", () => {
  // Component light rules may remain; re-declaring --bg-dark inside body.light-theme is forbidden.
  assert.doesNotMatch(
    style,
    /body\.light-theme\s*\{[^}]*--bg-dark\s*:/,
    "duplicate light-theme palette found in style.css"
  );
  assert.match(style, /Light theme CSS variables live only in css\/design-tokens\.css/);
});
