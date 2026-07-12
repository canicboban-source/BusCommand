const { test, expect } = require("@playwright/test");
const pkg = require("../../package.json");

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8766";

test.describe("API smoke", () => {
  test("GET /api/health", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
  });

  test("GET /api/config", async ({ request }) => {
    const res = await request.get(`${BASE}/api/config`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toMatch(/demo|production/);
    expect(body.version).toBe(pkg.version);
  });

  test("POST /api/auth/driver-login rejects empty body", async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/driver-login`, {
      data: {}
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("POST /api/auth/driver-login demo drv-1", async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/driver-login`, {
      data: { companyId: "demo", driverId: "drv-1", pin: "1234" }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.demo).toBe(true);
    expect(body.user.name).toBeTruthy();
  });

  test("GET /api/license/demo", async ({ request }) => {
    const res = await request.get(`${BASE}/api/license/demo`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("active");
  });
});
