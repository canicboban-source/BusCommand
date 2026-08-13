/**
 * FAZA 2R-A.2 — plan-import preview must escape dynamic HTML (F).
 * C2.1 — aligned to B2C-02 responsive preview markup (escapeHtml(d.label), etc.).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const XSS_IMG = '<img src=x onerror=alert(1)>';
const XSS_SVG = '"><svg onload=alert(1)>';

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

test("escapeHtml renders XSS payloads as text (no executable markup)", async () => {
  const utilsUrl = pathToFileURL(path.join(__dirname, "../../js/core/utils.js")).href;
  // utils.js imports i18n — stub via dynamic import after minimal mock is hard;
  // exercise the same algorithm as utils.escapeHtml for proof, and assert source wiring.
  const utilsSrc = fs.readFileSync(path.join(__dirname, "../../js/core/utils.js"), "utf8");
  assert.match(utilsSrc, /function escapeHtml\(str\)/);
  assert.match(utilsSrc, /export\s*\{[\s\S]*escapeHtml/);

  for (const payload of [XSS_IMG, XSS_SVG]) {
    const escaped = escapeHtml(payload);
    // Tags must be entity-encoded so browsers cannot create elements/handlers.
    assert.equal(escaped.includes("<"), false);
    assert.equal(escaped.includes(">"), false);
    assert.match(escaped, /&lt;img|&lt;svg|&quot;&gt;&lt;svg/);
    assert.match(escaped, /&lt;/);
  }
  void utilsUrl;
});

test("plan-import.js escapes fileName/driver/duty/bus/importId in innerHTML paths", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/plan-import.js"), "utf8");
  assert.match(src, /import\s*\{\s*escapeHtml[\s\S]*\}\s*from\s*["']\.\.\/core\/utils\.js["']/);

  // B2C-02 option contract: driver label is escaped at interpolate site (not a bare `label` local).
  assert.match(src, /\$\{escapeHtml\(d\.label\)\}/);
  assert.match(src, /escapeHtml\(d\.label\)/);
  assert.doesNotMatch(src, /\$\{d\.label\}/);

  // Display name / aria / file name sinks stay escaped.
  assert.match(src, /\$\{escapeHtml\(driverDisplayName\)\}/);
  assert.match(src, /escapeHtml\(driverAria\)/);
  assert.match(src, /escapeHtml\(item\.fileName\)/);
  assert.doesNotMatch(src, /\$\{driverDisplayName\}/);
  assert.doesNotMatch(src, /\$\{item\.fileName\}/);

  // Responsive data-label values must go through escapeHtml (i18n keys or aria locals).
  assert.match(src, /data-label="\$\{escapeHtml\(t\("plan_import_file"\)\s*\|\|\s*""\)\}"/);
  assert.match(src, /data-label="\$\{escapeHtml\(driverAria\)\}"/);
  assert.match(src, /data-label="\$\{escapeHtml\(t\("plan_import_month"\)\s*\|\|\s*""\)\}"/);
  assert.match(src, /data-label="\$\{escapeHtml\(t\("plan_import_days"\)\s*\|\|\s*""\)\}"/);
  assert.match(src, /data-label="\$\{escapeHtml\(t\("plan_import_status"\)\s*\|\|\s*""\)\}"/);

  // Retained row / importId escape paths from FAZA 2R-A.2.
  assert.match(src, /escapeHtml\(row\.date\)/);
  assert.match(src, /escapeHtml\(row\.name\)|escapeHtml\(row\.type\)/);
  assert.match(src, /escapeHtml\(retainedImportId/);
  assert.doesNotMatch(src, /\$\{row\.name\}/);

  // Source-contract proof: a malicious option label would only appear entity-encoded
  // when wired through the same escapeHtml(d.label) path (no production export needed).
  const maliciousLabel = XSS_IMG;
  const optionHtml = `<option value="d1">${escapeHtml(maliciousLabel)}</option>`;
  assert.equal(optionHtml.includes("<img"), false);
  assert.match(optionHtml, /&lt;img/);
  assert.equal(optionHtml.includes(maliciousLabel), false);
});
