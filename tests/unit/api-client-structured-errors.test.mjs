import test from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../../js/core/api-client.js";

function mockWindowFetch(responder) {
    globalThis.window = {
        fetch: async (url, options) => responder(url, options)
    };
}

test("ApiClient.fetch: valid JSON success", async () => {
    mockWindowFetch(async () => ({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => ({ success: true, payload: "ok" })
    }));
    const res = await ApiClient.fetch("/api/test");
    assert.equal(res.success, true);
    assert.equal(res.payload, "ok");
});

test("ApiClient.fetch: JSON 400 / 401 / 403 / 404 / 409 / 429 / 500 with custom error", async () => {
    const cases = [
        { status: 400, code: "INVALID_PARAM", error: "Bad input" },
        { status: 401, code: "INVALID_TOKEN", error: "Token expired" },
        { status: 403, code: "FORBIDDEN", error: "No permission" },
        { status: 404, code: "NOT_FOUND", error: "Missing entity" },
        { status: 409, code: "REVISION_CONFLICT", error: "Conflict" },
        { status: 429, code: "RATE_LIMITED", error: "Too fast" },
        { status: 500, code: "DATABASE_ERROR", error: "DB fail" }
    ];
    for (const c of cases) {
        mockWindowFetch(async () => ({
            ok: false,
            status: c.status,
            headers: new Map([["content-type", "application/json"]]),
            json: async () => ({ success: false, code: c.code, error: c.error })
        }));
        const res = await ApiClient.fetch("/api/test");
        assert.equal(res.success, false);
        assert.equal(res.status, c.status);
        assert.equal(res.code, c.code);
        assert.equal(res.error, c.error);
    }
});

test("ApiClient.fetch: empty 500 body", async () => {
    mockWindowFetch(async () => ({
        ok: false,
        status: 500,
        headers: new Map([["content-type", "text/plain"]]),
        text: async () => ""
    }));
    const res = await ApiClient.fetch("/api/test");
    assert.equal(res.success, false);
    assert.equal(res.status, 500);
    assert.equal(res.code, "SERVICE_UNAVAILABLE");
    assert.equal(res.error, "Servis je trenutno nedostupan.");
});

test("ApiClient.fetch: HTML 500 / 502 / 503 / 504 proxy error pages", async () => {
    for (const status of [500, 502, 503, 504]) {
        mockWindowFetch(async () => ({
            ok: false,
            status,
            headers: new Map([["content-type", "text/html; charset=utf-8"]]),
            text: async () => `<html><body><h1>${status} Bad Gateway</h1><pre>Error stack</pre></body></html>`
        }));
        const res = await ApiClient.fetch("/api/test");
        assert.equal(res.success, false);
        assert.equal(res.status, status);
        assert.equal(res.code, "SERVICE_UNAVAILABLE");
        assert.equal(res.error, "Servis je trenutno nedostupan.");
        assert.doesNotMatch(res.error, /<html>|<pre>|Bad Gateway/);
    }
});

test("ApiClient.fetch: wrong content-type on 200 OK (e.g. HTML login page)", async () => {
    mockWindowFetch(async () => ({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "text/html"]]),
        text: async () => "<!DOCTYPE html><html>Login</html>"
    }));
    const res = await ApiClient.fetch("/api/test");
    assert.equal(res.success, false);
    assert.equal(res.status, 200);
    assert.equal(res.code, "INVALID_RESPONSE");
    assert.equal(res.error, "Nevalidan odgovor servera.");
});

test("ApiClient.fetch: malformed JSON on 200 OK", async () => {
    mockWindowFetch(async () => ({
        ok: true,
        status: 200,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => { throw new SyntaxError("Unexpected token"); }
    }));
    const res = await ApiClient.fetch("/api/test");
    assert.equal(res.success, false);
    assert.equal(res.status, 200);
    assert.equal(res.code, "INVALID_RESPONSE");
});

test("ApiClient.fetch: 204 No Content handled as valid success", async () => {
    mockWindowFetch(async () => ({
        ok: true,
        status: 204,
        headers: new Map(),
        text: async () => ""
    }));
    const res = await ApiClient.fetch("/api/test");
    assert.equal(res.success, true);
    assert.equal(res.status, 204);
});

test("ApiClient.fetch: network/fetch rejection (offline / DNS)", async () => {
    mockWindowFetch(async () => {
        throw new TypeError("Failed to fetch");
    });
    const res = await ApiClient.fetch("/api/test");
    assert.equal(res.success, false);
    assert.equal(res.status, 0);
    assert.equal(res.code, "NETWORK_ERROR");
    assert.equal(res.error, "Mrežna greška. Proverite internet vezu.");
});
