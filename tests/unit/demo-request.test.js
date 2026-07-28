const test = require("node:test");
const assert = require("node:assert/strict");
const { isLocalDemoRequest } = require("../../server/driver-routes");

test("server demo is available only for local non-production requests", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "test";
    assert.equal(isLocalDemoRequest({ hostname: "localhost" }), true);
    assert.equal(isLocalDemoRequest({ hostname: "127.0.0.1" }), true);
    assert.equal(isLocalDemoRequest({ hostname: "buscommand-preview.onrender.com" }), false);
    process.env.NODE_ENV = "production";
    assert.equal(isLocalDemoRequest({ hostname: "localhost" }), false);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
