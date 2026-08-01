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

  test("Super Admin overview rejects an unauthenticated request", async ({ request }) => {
    const response = await request.get("/api/admin/overview");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: expect.any(String) });
  });

  test("public driver directory is disabled and identify fails closed without Firebase", async ({ request }) => {
    const directory = await request.get(`${BASE}/api/public/companies/demo/drivers`);
    const directoryBody = await directory.json();
    expect(directory.status()).toBe(410);
    expect(directoryBody.success).toBe(false);
    expect(directoryBody.code).toBe("PUBLIC_DRIVER_DIRECTORY_DISABLED");
    const identified = await request.post(`${BASE}/api/public/drivers/identify`, { data: { companyId: "local-test", eid: "TEST-EID" } });
    const identifiedBody = await identified.json();
    expect(identified.status()).toBe(503);
    expect(identifiedBody.success).toBe(false);
    expect(identifiedBody.code).toBe("FIREBASE_UNAVAILABLE");
  });

  test("POST /api/auth/driver-login fails closed without Firebase", async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/driver-login`, {
      data: { companyId: "local-test", driverId: "11111111-1111-4111-8111-111111111111", loginCode: "482913" }
    });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("FIREBASE_UNAVAILABLE");
    expect(body.token).toBeUndefined();
  });

  test("public host cannot use known local demo driver", async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/driver-login`, {
      headers: { Host: "buscommand-preview.onrender.com" },
      data: { companyId: "demo", driverId: "11111111-1111-4111-8111-111111111111", loginCode: "482913" }
    });
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.token).toBeUndefined();
  });

  test("GET /api/license fails closed without Firebase", async ({ request }) => {
    const res = await request.get(`${BASE}/api/license/local-test`);
    expect(res.status()).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
