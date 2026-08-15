"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");
const STAGING_ORIGIN = "https://bc-staging.example";

function waitReady(port, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - started > timeoutMs) reject(new Error("ready timeout"));
        else setTimeout(attempt, 200);
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("ready timeout"));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

function request(port, { method = "GET", path: reqPath = "/api/health", origin, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: reqPath,
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...headers
      }
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body
      }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("staging CORS allows configured origin, denies production, supports OPTIONS", async () => {
  const port = 18767;
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
    await waitReady(port);

    const ok = await request(port, { origin: STAGING_ORIGIN });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["access-control-allow-origin"], STAGING_ORIGIN);
    assert.deepEqual(JSON.parse(ok.body), { ok: true });

    const denied = await request(port, { origin: "https://buscommand.com" });
    assert.equal(denied.status, 403);

    const lookalike = await request(port, { origin: `${STAGING_ORIGIN}.evil.example` });
    assert.equal(lookalike.status, 403);

    const options = await request(port, {
      method: "OPTIONS",
      path: "/api/health",
      origin: STAGING_ORIGIN,
      headers: { "Access-Control-Request-Method": "GET" }
    });
    assert.ok(options.status === 204 || options.status === 200);
    assert.equal(options.headers["access-control-allow-origin"], STAGING_ORIGIN);

    const api404 = await request(port, {
      path: "/api/this-route-does-not-exist-3d11",
      origin: STAGING_ORIGIN
    });
    assert.equal(api404.status, 404);
    assert.match(api404.headers["content-type"] || "", /json/i);
    assert.doesNotMatch(api404.body, /<!DOCTYPE html>/i);
  } finally {
    child.kill("SIGTERM");
  }
});
