const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const INDEX = path.join(ROOT, "index.html");
const LANDING_SRC = path.join(ROOT, "scripts/landing/official-landing.html");

test("official landing source is the rich presentation, not a two-button card", () => {
  assert.ok(fs.existsSync(LANDING_SRC), "scripts/landing/official-landing.html missing");
  const src = fs.readFileSync(LANDING_SRC, "utf8");
  for (const needle of [
    'id="top"',
    'id="compare"',
    'id="downloads"',
    'id="pricing"',
    'data-lang="de"',
    'data-lang="sr"',
    'data-lang="en"',
    "/downloads/BusCommand_Technical_Security_Audit.html",
    "/downloads/BusCommand_Monthly_Shift_Plan_Template.csv",
    "/downloads/BusCommand_Fleet_Vehicles_Template.csv",
    "/downloads/BusCommand_DPA_GDPR_Article_28.html",
    'href="/staff"',
    'href="/driver"',
    "Excel",
    "Cenovnik",
    "Preise",
    "Pricing"
  ]) {
    assert.match(src, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(src, /<main class="card">/);
});

test("generated index.html serves the official landing presentation", () => {
  assert.ok(fs.existsSync(INDEX), "index.html missing");
  const html = fs.readFileSync(INDEX, "utf8");
  assert.match(html, /id="compare"/);
  assert.match(html, /id="downloads"/);
  assert.match(html, /id="pricing"/);
  assert.match(html, /lang-switch/);
  assert.match(html, /data-lang="de"/);
  assert.match(html, /data-lang="sr"/);
  assert.match(html, /data-lang="en"/);
  assert.match(html, /\/downloads\/BusCommand_Technical_Security_Audit.html/);
  assert.doesNotMatch(html, /<main class="card">[\s\S]*Staff login[\s\S]*Driver app[\s\S]*<\/main>/);
});

test("build-surface-html reads official landing source instead of inline minimal card", () => {
  const build = fs.readFileSync(path.join(ROOT, "scripts/build-surface-html.js"), "utf8");
  assert.match(build, /official-landing\.html/);
  assert.doesNotMatch(build, /Fleet operations for bus companies — dispatch, monthly plans/);
});
