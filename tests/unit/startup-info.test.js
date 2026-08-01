const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildStartupInfo } = require("../../server/startup-info");

test("public startup output identifies Preview without demo credentials or local addresses", () => {
  const startup = buildStartupInfo({
    nodeEnv: "production",
    hasFirebase: true,
    hasDist: true,
    port: 3000,
    localIp: "192.168.1.20",
  });
  const output = startup.lines.join("\n");

  assert.equal(startup.mode, "PREVIEW");
  assert.match(output, /Režim: PREVIEW/);
  for (const forbidden of [
    "+ demo",
    "Demo admin:",
    "Demo dispo:",
    "Demo driver:",
    "localhost",
    "192.168.1.20",
    "Demo URL:",
  ]) {
    assert.doesNotMatch(output, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("local development startup exposes local URLs without bundled test credentials", () => {
  const startup = buildStartupInfo({
    nodeEnv: "development",
    hasFirebase: false,
    hasDist: true,
    port: 3000,
    localIp: "192.168.1.20",
  });
  const output = startup.lines.join("\n");

  assert.equal(startup.mode, "LOKALNI DEVELOPMENT");
  assert.match(output, /Lokalno:/);
  assert.doesNotMatch(output, /Demo URL:|Demo admin:|demo123|admin@demo/i);
  assert.match(output, /192\.168\.1\.20/);
});

test("local startup survives restricted network-interface discovery", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");
  assert.match(source, /function getLocalIP\(\)\s*\{[\s\S]*?try\s*\{[\s\S]*?os\.networkInterfaces\(\)[\s\S]*?catch[\s\S]*?return "localhost"/);
  assert.match(source, /for \(const net of nets\[name\] \|\| \[\]\)/);
});
