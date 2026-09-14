import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import Auth from "../../js/core/auth-client.js";
import { ApiClient } from "../../js/core/api-client.js";

const originalGetIdToken = Auth.getIdToken;

function restoreAuth() {
    Auth.getIdToken = originalGetIdToken;
}

afterEach(restoreAuth);

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Map([["content-type", "application/json"]]),
        json: async () => body
    };
}

test("Auth.getIdToken exception returns TOKEN_LOOKUP_ERROR and does not call fetch", async () => {
    const leaks = [];
    globalThis.window = {
        fetch: async (...args) => {
            leaks.push(args);
            throw new Error("fetch must not run");
        }
    };
    Auth.getIdToken = async () => {
        const err = new Error("provider failed eyJhbGciOi-fake-token");
        err.stack = `${err.message}\n    at Auth.getIdToken (auth-client.js:174:9)`;
        throw err;
    };
    const res = await ApiClient.fetch("/api/driver/work-session");
    assert.equal(res.success, false);
    assert.equal(res.code, "TOKEN_LOOKUP_ERROR");
    assert.equal(res.status, 0);
    assert.equal(leaks.length, 0);
    const serialized = JSON.stringify(res);
    assert.equal(Object.prototype.hasOwnProperty.call(res, "error"), false);
    assert.doesNotMatch(serialized, /eyJhbGciOi-fake-token/);
    assert.doesNotMatch(serialized, /provider failed/);
    assert.doesNotMatch(serialized, /auth-client\.js:174/);
    assert.equal(res.stack, undefined);
    assert.equal(res.message, undefined);
    assert.equal(res.token, undefined);
});

test("valid token is sent once with Authorization and success is unchanged", async () => {
    const calls = [];
    globalThis.window = {
        fetch: async (url, options) => {
            calls.push({ url, options });
            return jsonResponse(200, { success: true, policy: { status: "active" } });
        }
    };
    Auth.getIdToken = async () => "valid-id-token-abc";
    const res = await ApiClient.fetch("/api/driver/work-session");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/driver/work-session");
    assert.equal(calls[0].options.headers.Authorization, "Bearer valid-id-token-abc");
    assert.equal(res.success, true);
    assert.equal(res.policy.status, "active");
});

test("null token still sends a public/anonymous request without Authorization", async () => {
    const calls = [];
    globalThis.window = {
        fetch: async (url, options) => {
            calls.push({ url, options });
            return jsonResponse(200, { success: true, public: true });
        }
    };
    Auth.getIdToken = async () => null;
    const res = await ApiClient.fetch("/api/health");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(calls[0].options.headers, "Authorization"), false);
    assert.equal(res.success, true);
    assert.equal(res.public, true);
});

test("token present but window.fetch rejection stays NETWORK_ERROR", async () => {
    let fetchCalls = 0;
    globalThis.window = {
        fetch: async () => {
            fetchCalls += 1;
            throw new TypeError("Failed to fetch");
        }
    };
    Auth.getIdToken = async () => "valid-id-token-abc";
    const res = await ApiClient.fetch("/api/driver/work-session");
    assert.equal(fetchCalls, 1);
    assert.equal(res.success, false);
    assert.equal(res.status, 0);
    assert.equal(res.code, "NETWORK_ERROR");
    assert.notEqual(res.code, "TOKEN_LOOKUP_ERROR");
});

test("real HTTP 401 stays 401 and is not converted to TOKEN_LOOKUP_ERROR", async () => {
    const calls = [];
    globalThis.window = {
        fetch: async (url, options) => {
            calls.push({ url, options });
            return jsonResponse(401, {
                success: false,
                code: "INVALID_TOKEN",
                error: "Nevažeći token."
            });
        }
    };
    Auth.getIdToken = async () => "stale-but-present-token";
    const res = await ApiClient.fetch("/api/driver/work-session");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, "Bearer stale-but-present-token");
    assert.equal(res.success, false);
    assert.equal(res.status, 401);
    assert.equal(res.code, "INVALID_TOKEN");
    assert.notEqual(res.code, "TOKEN_LOOKUP_ERROR");
});
