import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { registerDriverRoutes } from "../../server/driver-routes.js";

async function startRealHttpServer() {
    const app = express();
    app.use(express.json());

    const mockDbData = {
        drivers: new Map([
            ["Vwz3K9LpQ2mNx8yRt1bC4dE6fGh7", { id: "Vwz3K9LpQ2mNx8yRt1bC4dE6fGh7", name: "Boban Canić", active: true, groupId: "101", companyId: "comp-1" }],
            ["K2mNx8yRt1bC4dE6fGh7Vwz3K9Lp", { id: "K2mNx8yRt1bC4dE6fGh7Vwz3K9Lp", name: "Petar Petrović", active: true, groupId: "101", companyId: "comp-1" }],
            ["ForeignDriverUid999999999999", { id: "ForeignDriverUid999999999999", name: "Foreign Driver", active: true, groupId: "102", companyId: "comp-2" }]
        ]),
        shifts: new Map(),
        reports: new Map(),
        buses: new Map([
            ["101", { number: "101", active: true, opsStatus: "active", groupId: "101" }]
        ])
    };

    const makeDocRef = (colName, id) => ({
        id,
        get: async () => {
            const store = mockDbData[colName];
            const data = store ? store.get(id) : null;
            return {
                exists: Boolean(data),
                data: () => data || {},
                id,
                ref: makeDocRef(colName, id)
            };
        },
        set: async (data, opt) => {
            const store = mockDbData[colName] || new Map();
            mockDbData[colName] = store;
            store.set(id, opt?.merge ? { ...(store.get(id) || {}), ...data } : data);
        },
        delete: async () => {
            mockDbData[colName]?.delete(id);
        },
        collection: (sub) => makeCollectionRef(sub)
    });

    const makeCollectionRef = (colName) => ({
        doc: (id) => makeDocRef(colName, id),
        where: () => ({
            get: async () => ({ docs: [] }),
            where: () => ({
                get: async () => ({ docs: [] }),
                limit: () => ({ get: async () => ({ docs: [] }) })
            }),
            limit: () => ({
                get: async () => ({
                    docs: [{ exists: true, ref: makeDocRef("buses", "101"), data: () => ({ number: "101", active: true, opsStatus: "active", groupId: "101" }) }]
                })
            })
        }),
        limit: () => ({
            get: async () => ({
                docs: [{ exists: true, ref: makeDocRef("buses", "101"), data: () => ({ number: "101", active: true, opsStatus: "active", groupId: "101" }) }]
            })
        })
    });

    const db = {
        collection: (col) => {
            if (col === "companies") {
                return {
                    doc: (cid) => ({
                        id: cid,
                        collection: (sub) => makeCollectionRef(sub)
                    })
                };
            }
            return makeCollectionRef(col);
        },
        runTransaction: async (fn) => {
            const tx = {
                get: async (ref) => {
                    if (ref && typeof ref.get === "function") return ref.get();
                    return {
                        exists: true,
                        docs: [],
                        data: () => ({
                            status: "open",
                            active: true,
                            revision: 0,
                            date: "2026-08-23",
                            shiftType: "morning",
                            shiftName: "101.S01",
                            bus: "101",
                            driverId: "Vwz3K9LpQ2mNx8yRt1bC4dE6fGh7"
                        })
                    };
                },
                set: (ref, data, opt) => {
                    if (ref && typeof ref.set === "function") ref.set(data, opt);
                },
                update: (ref, data) => {
                    if (ref && typeof ref.set === "function") ref.set(data, { merge: true });
                },
                delete: (ref) => {
                    if (ref && typeof ref.delete === "function") ref.delete();
                }
            };
            return fn(tx);
        }
    };

    const tokens = new Map([
        ["driver-token-boban", { uid: "Vwz3K9LpQ2mNx8yRt1bC4dE6fGh7", companyId: "comp-1", role: "driver", mustChangeLoginCode: false }],
        ["driver-token-foreign", { uid: "ForeignDriverUid999999999999", companyId: "comp-2", role: "driver", mustChangeLoginCode: false }],
        ["staff-token-disp", { uid: "staff-1", companyId: "comp-1", role: "dispatcher", groups: ["101"], active: true }]
    ]);

    const deps = {
        admin: () => ({
            auth: () => ({
                verifyIdToken: async (token) => {
                    const decoded = tokens.get(token);
                    if (!decoded) {
                        const err = new Error("Invalid token");
                        err.code = "auth/invalid-id-token";
                        throw err;
                    }
                    return decoded;
                }
            }),
            firestore: {
                FieldValue: {
                    serverTimestamp: () => new Date(),
                    delete: () => "__DELETE__"
                }
            }
        }),
        db: () => db,
        hasFirebase: () => true,
        rateLimit: () => (_r, _s, next) => next ? next() : null,
        clearRateLimit: () => {},
        getClientIp: () => "127.0.0.1",
        logAudit: async () => {},
        staffAuth: {
            requireCompanyStaff: (req, res, next) => {
                const authHeader = req.headers.authorization || "";
                const token = authHeader.replace(/^Bearer\s+/i, "");
                const decoded = tokens.get(token);
                if (!decoded || decoded.role !== "dispatcher") {
                    return res.status(401).json({ success: false, code: "UNAUTHORIZED", error: "Neautorizovan pristup." });
                }
                req.staffUser = decoded;
                req.staff = decoded;
                return next();
            }
        }
    };

    registerDriverRoutes(app, deps);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    return {
        port,
        mockDbData,
        async close() {
            await new Promise((resolve) => server.close(resolve));
        },
        async request(path, { method = "GET", token, body } = {}) {
            const res = await fetch(`http://127.0.0.1:${port}${path}`, {
                method,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(body ? { "Content-Type": "application/json" } : {})
                },
                body: body ? JSON.stringify(body) : undefined
            });
            const text = await res.text();
            let json = null;
            try { json = JSON.parse(text); } catch { /* text */ }
            return { status: res.status, json, text };
        }
    };
}

test("Real HTTP Stack: Driver shift single and all confirmations", async () => {
    const srv = await startRealHttpServer();
    try {
        const driverId = "Vwz3K9LpQ2mNx8yRt1bC4dE6fGh7";
        const date = "2026-08-24";
        srv.mockDbData.shifts.set(`${driverId}_${date}`, {
            date,
            type: "morning",
            start: "05:00",
            end: "13:00",
            groupId: "101",
            revision: 0
        });

        // 1. Single confirmation request over HTTP
        const res1 = await srv.request("/api/driver/shift-confirmations", {
            method: "POST",
            token: "driver-token-boban",
            body: { dates: [date] }
        });
        // Handler executed through real Express router and loaded policy on the fly
        assert.equal(res1.status, 403);
        assert.equal(res1.json?.success, false);
        assert.match(res1.json?.error, /ponuđene naredne smene/);

        // 2. Confirm all request over HTTP (multiple dates)
        const res2 = await srv.request("/api/driver/shift-confirmations", {
            method: "POST",
            token: "driver-token-boban",
            body: { dates: [date, "2026-08-25"] }
        });
        assert.equal(res2.status, 403);
        assert.equal(res2.json?.success, false);
    } finally {
        await srv.close();
    }
});

test("Real HTTP Stack: Security boundaries, auth failures and malformed payloads", async () => {
    const srv = await startRealHttpServer();
    try {
        // Missing authentication -> 401
        const resNoAuth = await srv.request("/api/driver/shift-confirmations", {
            method: "POST",
            body: { dates: ["2026-08-24"] }
        });
        assert.equal(resNoAuth.status, 401);
        assert.equal(resNoAuth.json?.success, false);

        // Malformed body -> 400
        const resBadBody = await srv.request("/api/driver/shift-confirmations", {
            method: "POST",
            token: "driver-token-boban",
            body: { dates: "not-an-array" }
        });
        assert.equal(resBadBody.status, 400);
        assert.equal(resBadBody.json?.success, false);

        // Foreign company / driver cross-tenant attempt
        const resForeign = await srv.request("/api/driver/shift-confirmations", {
            method: "POST",
            token: "driver-token-foreign",
            body: { dates: ["2026-08-24"] }
        });
        assert.equal(resForeign.status, 403);
        assert.equal(resForeign.json?.success, false);
    } finally {
        await srv.close();
    }
});

test("Real HTTP Stack: Incident resolution accepts 28-character Firebase UIDs and rejects injection", async () => {
    const srv = await startRealHttpServer();
    try {
        const reportId = "inc-test-123";
        srv.mockDbData.reports.set(reportId, {
            id: reportId,
            driverId: "Vwz3K9LpQ2mNx8yRt1bC4dE6fGh7",
            groupId: "101",
            date: "2026-08-23",
            shiftType: "morning",
            shiftName: "101.S01",
            bus: "101",
            status: "open",
            revision: 0
        });

        // 1. Valid 28-char Firebase UID resolution -> 200 OK
        const resOk = await srv.request(`/api/staff/operational-incidents/${reportId}/resolve`, {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                replacementDriverId: "K2mNx8yRt1bC4dE6fGh7Vwz3K9Lp",
                replacementBus: "101",
                expectedOriginalRevision: 0,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(resOk.status, 200);
        assert.equal(resOk.json?.success, true);
        assert.equal(resOk.json?.report?.status, "resolved");

        // 2. Path traversal / illegal identifier in driverId -> 400 Bad Request
        const resBadId = await srv.request(`/api/staff/operational-incidents/${reportId}/resolve`, {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                replacementDriverId: "../../etc/passwd",
                replacementBus: "101",
                expectedOriginalRevision: 0,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(resBadId.status, 400);
        assert.equal(resBadId.json?.success, false);
        assert.equal(resBadId.json?.code, "INVALID_RESOLUTION");
    } finally {
        await srv.close();
    }
});
