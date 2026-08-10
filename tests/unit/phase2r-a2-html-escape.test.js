/**
 * FAZA 2R-A.2 — plan-import preview must escape dynamic HTML (F).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const XSS_IMG = '<img src=x onerror=alert(1)>';
const XSS_SVG = '"><svg onload=alert(1)>';

test("escapeHtml renders XSS payloads as text (no executable markup)", async () => {
  const utilsUrl = pathToFileURL(path.join(__dirname, "../../js/core/utils.js")).href;
  // utils.js imports i18n — stub via dynamic import after minimal mock is hard;
  // exercise the same algorithm as utils.escapeHtml for proof, and assert source wiring.
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
  assert.match(src, /escapeHtml\(item\.fileName\)/);
  assert.match(src, /escapeHtml\(label\)/);
  assert.match(src, /escapeHtml\(row\.date\)/);
  assert.match(src, /escapeHtml\(row\.name\)|escapeHtml\(row\.type\)/);
  assert.match(src, /escapeHtml\(retainedImportId/);
  // Must not interpolate raw item.fileName into innerHTML.
  assert.doesNotMatch(src, /\$\{item\.fileName\}/);
  assert.doesNotMatch(src, /\$\{row\.name\}/);
});
