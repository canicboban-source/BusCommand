import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";

function createTestServer() {
  const app = express();

  const defaultJsonParser = express.json({ limit: "64kb" });
  const servicePlanJsonParser = express.json({ limit: "4mb" });
  const brandingJsonParser = express.json({ limit: "512kb" });
  const lostItemJsonParser = express.json({ limit: "700kb" });

  app.use((req, res, next) => {
    if (req.method === "PUT" && req.path === "/api/company-admin/branding") {
      return brandingJsonParser(req, res, next);
    }
    if (req.method === "POST" && req.path === "/api/driver/lost-items") {
      return lostItemJsonParser(req, res, next);
    }
    const isServicePlanWrite = req.path.startsWith("/api/company-admin/service-plans/");
    return (isServicePlanWrite ? servicePlanJsonParser : defaultJsonParser)(req, res, next);
  });

  app.post("/api/generic-endpoint", (req, res) => {
    res.json({ ok: true, receivedBytes: JSON.stringify(req.body).length });
  });

  app.post("/api/driver/lost-items", (req, res) => {
    res.json({ ok: true, photoLen: req.body?.photo?.dataBase64?.length || 0 });
  });

  return app;
}

function sendJson(server, { method, path, body }) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { raw += chunk; });
        res.on("end", () => {
          let json = null;
          try { json = JSON.parse(raw); } catch { /* ignore */ }
          resolve({ status: res.statusCode, body: json, text: raw });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

test("BC-A07: generic endpoints enforce strict 64 KB limit (defense-in-depth)", async (t) => {
  const app = createTestServer();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const largeData = "x".repeat(100 * 1024);
  const res = await sendJson(server, {
    method: "POST",
    path: "/api/generic-endpoint",
    body: { data: largeData }
  });
  assert.equal(res.status, 413, "Payload exceeding 64kb on generic endpoint must return 413");
});

test("BC-A07: /api/driver/lost-items accepts valid photo payload (~200 KB) and rejects oversized (>700 KB)", async (t) => {
  const app = createTestServer();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const validPhotoBase64 = "a".repeat(200 * 1024);
  const validRes = await sendJson(server, {
    method: "POST",
    path: "/api/driver/lost-items",
    body: {
      bus: "BUS-101",
      description: "Lost jacket with wallet",
      photo: {
        contentType: "image/jpeg",
        dataBase64: validPhotoBase64
      }
    }
  });
  assert.equal(validRes.status, 200, "Valid 200 KB lost item photo must pass JSON body parser");
  assert.equal(validRes.body?.ok, true);
  assert.equal(validRes.body?.photoLen, 200 * 1024);

  const oversizedPhotoBase64 = "b".repeat(800 * 1024);
  const oversizedRes = await sendJson(server, {
    method: "POST",
    path: "/api/driver/lost-items",
    body: {
      bus: "BUS-101",
      description: "Too big",
      photo: {
        contentType: "image/jpeg",
        dataBase64: oversizedPhotoBase64
      }
    }
  });
  assert.equal(oversizedRes.status, 413, "Oversized >700 KB lost item photo must return 413");
});
