const assert = require("node:assert/strict");
const test = require("node:test");

const { clearRateLimit, rateLimit } = require("../../server/rate-limit");

function invoke(limiter, ip = "127.0.0.1") {
  let status = 200;
  let nextCalled = false;
  const req = { ip };
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  limiter(req, res, () => { nextCalled = true; });
  return { status, nextCalled, req };
}

test("separate route limiters do not consume each other's IP budget", () => {
  const login = rateLimit(1, 60_000);
  const identify = rateLimit(1, 60_000);
  assert.equal(invoke(login).nextCalled, true);
  assert.equal(invoke(identify).nextCalled, true);
  assert.equal(invoke(login).status, 429);
  assert.equal(invoke(identify).status, 429);
  clearRateLimit("127.0.0.1");
  assert.equal(invoke(login).nextCalled, true);
  assert.equal(invoke(identify).nextCalled, true);
});
