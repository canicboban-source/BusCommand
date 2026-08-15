"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const STAGING_ORIGIN = "https://bc-staging.example";

function waitForHealth(port, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 1000 }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("health timeout"));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

test("GET /api/health is liveness-only JSON with no-store under QA harness", async () => {
  const port = 18766;
  const child = spawn(process.execPath, ["api-server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "production",
      BUSCOMMAND_ENV: "staging",
      BUSCOMMAND_QA_HARNESS: "1",
      CORS_ORIGINS: STAGING_ORIGIN
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    const result = await waitForHealth(port);
    assert.equal(result.status, 200);
    assert.match(String(result.headers["cache-control"] || ""), /no-store/i);
    const json = JSON.parse(result.body);
    assert.deepEqual(json, { ok: true });
    assert.equal(Object.prototype.hasOwnProperty.call(json, "firebase"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(json, "version"), false);
  } finally {
    child.kill("SIGTERM");
  }
});
