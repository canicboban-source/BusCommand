import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { registerDriverRoutes } from "../../server/driver-routes.js";

async function startTestServer() {
    const app = express();
    app.use(express.json());

    const mockDbData = {
        drivers: new Map([
            ["drv-luka-1", { id: "drv-luka-1", name: "Luka Kovačević", active: true, groupId: "101", companyId: "comp-1" }],
            ["drv-marko-2", { id: "drv-marko-2", name: "Marko Jovanović", active: true, groupId: "101", companyId: "comp-1" }],
            ["drv-foreign-9", { id: "drv-foreign-9", name: "Foreign Driver", active: true, groupId: "102", companyId: "comp-2" }]
        ]),
        shifts: new Map(),
        schedules: new Map(),
        reports: new Map(),
        buses: new Map([
            ["101", { number: "101", active: true, opsStatus: "active", groupId: "101" }]
        ]),
        audit_log: new Map(),
        profile: new Map([
            ["main", { timezone: "Europe/Vienna" }]
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
        update: async (data) => {
            const store = mockDbData[colName] || new Map();
            mockDbData[colName] = store;
            const existing = store.get(id) || {};
            store.set(id, { ...existing, ...data });
        },
        delete: async () => {
            mockDbData[colName]?.delete(id);
        },
        collection: (sub) => makeCollectionRef(sub)
    });

    const makeCollectionRef = (colName) => ({
        doc: (id) => makeDocRef(colName, id || `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`),
        where: (field, op, val) => {
            const filters = [{ field, op, val }];
            const chain = {
                where: (f2, op2, val2) => {
                    filters.push({ field: f2, op: op2, val: val2 });
                    return chain;
                },
                limit: () => chain,
                get: async () => {
                    const store = mockDbData[colName] || new Map();
                    const matched = [];
                    for (const [docId, data] of store.entries()) {
                        const match = filters.every(({ field: f, val: v }) => {
                            return data[f] === v;
                        });
                        if (match) {
                            matched.push({
                                id: docId,
                                exists: true,
                                data: () => data,
                                ref: makeDocRef(colName, docId)
                            });
                        }
                    }
                    return { docs: matched };
                }
            };
            return chain;
        },
        limit: () => ({
            get: async () => {
                const store = mockDbData[colName] || new Map();
                const docs = Array.from(store.entries()).map(([docId, data]) => ({
                    id: docId,
                    exists: true,
                    data: () => data,
                    ref: makeDocRef(colName, docId)
                }));
                return { docs };
            }
        }),
        get: async () => {
            const store = mockDbData[colName] || new Map();
            const docs = Array.from(store.entries()).map(([docId, data]) => ({
                id: docId,
                exists: true,
                data: () => data,
                ref: makeDocRef(colName, docId)
            }));
            return { docs };
        }
    });

    let txQueue = Promise.resolve();

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
        batch: () => {
            const operations = [];
            return {
                set: (ref, data) => operations.push(() => ref.set(data)),
                update: (ref, data) => operations.push(() => ref.update(data)),
                delete: (ref) => operations.push(() => ref.delete()),
                commit: async () => {
                    for (const op of operations) await op();
                }
            };
        },
        runTransaction: async (fn) => {
            const current = txQueue;
            let resolveNext;
            txQueue = new Promise((r) => { resolveNext = r; });
            await current;
            try {
                const tx = {
                    get: async (ref) => ref.get(),
                    set: (ref, data, opt) => ref.set(data, opt),
                    update: (ref, data) => ref.update(data),
                    delete: (ref) => ref.delete()
                };
                return await fn(tx);
            } finally {
                resolveNext();
            }
        }
    };

    const tokens = new Map([
        ["staff-token-disp", { uid: "disp-uid-1", email: "dispo@buscommand.com", role: "dispatcher", companyId: "comp-1", groups: ["101"], active: true }],
        ["staff-token-disp-all", { uid: "disp-uid-all", email: "dispo-all@buscommand.com", role: "dispatcher", companyId: "comp-1", groups: ["101", "102"], active: true }],
        ["staff-token-foreign", { uid: "disp-uid-foreign", email: "foreign@buscommand.com", role: "dispatcher", companyId: "comp-2", groups: ["102"], active: true }]
    ]);

    const deps = {
        admin: () => ({
            auth: () => ({
                verifyIdToken: async (token) => {
                    const decoded = tokens.get(token);
                    if (!decoded) throw new Error("Invalid token");
                    return decoded;
                }
            }),
            firestore: {
                FieldValue: {
                    serverTimestamp: () => new Date().toISOString(),
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
        },
        now: () => new Date()
    };

    registerDriverRoutes(app, deps);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    return {
        port,
        mockDbData,
        close: () => new Promise((resolve) => server.close(resolve)),
        request: async (path, options = {}) => {
            const res = await fetch(`http://127.0.0.1:${port}${path}`, {
                method: options.method || "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
                },
                body: options.body ? JSON.stringify(options.body) : undefined
            });
            const text = await res.text();
            let json = null;
            try {
                json = JSON.parse(text);
            } catch {
                // Ignore non-JSON responses
            }
            return { status: res.status, json, text };
        }
    };
}

function todayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("A. True concurrent creation: simultaneous requests produce exactly one active incident and one audit event", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        const payload = {
            affectedEntity: "driver",
            driverId: "drv-luka-1",
            date: today,
            reason: "Driver unavailable",
            description: "Concurrent click test",
            shiftType: "morning",
            shiftName: "101.S01",
            bus: "101"
        };

        // Launch 2 simultaneous identical creation requests via Promise.all
        const [resA, resB] = await Promise.all([
            srv.request("/api/staff/operational-incidents", { method: "POST", token: "staff-token-disp", body: payload }),
            srv.request("/api/staff/operational-incidents", { method: "POST", token: "staff-token-disp", body: payload })
        ]);

        const statuses = [resA.status, resB.status].sort();
        assert.deepEqual(statuses, [200, 201], "One request creates (201) and one reports duplicate (200)");

        const createdRes = resA.status === 201 ? resA : resB;
        const dupRes = resA.status === 200 ? resA : resB;

        assert.equal(createdRes.json?.success, true);
        assert.equal(dupRes.json?.success, true);
        assert.equal(dupRes.json?.duplicate, true);
        assert.equal(dupRes.json?.report?.id, createdRes.json?.report?.id, "Duplicate response returns identical report ID");

        assert.equal(srv.mockDbData.reports.size, 1, "Exactly one document exists in reports collection");
        assert.equal(srv.mockDbData.ops_active_incidents.size, 1, "Exactly one active guard exists");
        assert.equal(srv.mockDbData.audit_log.size, 1, "Exactly one audit creation record produced");
    } finally {
        await srv.close();
    }
});

test("B. Post-resolution recreation: new incident creates fresh historical report without overwriting resolved report", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        const payload = {
            affectedEntity: "driver",
            driverId: "drv-luka-1",
            date: today,
            reason: "Driver unavailable",
            description: "Morning incident",
            shiftType: "morning",
            shiftName: "101.S01",
            bus: "101"
        };

        // 1. Create first incident
        const create1 = await srv.request("/api/staff/operational-incidents", { method: "POST", token: "staff-token-disp", body: payload });
        assert.equal(create1.status, 201);
        const reportId1 = create1.json?.report?.id;

        // 2. Resolve via available_again
        const resolve1 = await srv.request(`/api/staff/operational-incidents/${reportId1}/resolve`, {
            method: "PUT",
            token: "staff-token-disp",
            body: { type: "available_again" }
        });
        assert.equal(resolve1.status, 200);
        assert.equal(resolve1.json?.report?.status, "resolved");

        // 3. Create incident again later for same driver/date
        const create2 = await srv.request("/api/staff/operational-incidents", { method: "POST", token: "staff-token-disp", body: payload });
        assert.equal(create2.status, 201);
        const reportId2 = create2.json?.report?.id;
        assert.notEqual(reportId1, reportId2, "New report gets fresh unique ID");

        // Verify both historical documents exist in reports store
        assert.equal(srv.mockDbData.reports.size, 2, "Both historical reports preserved");
        assert.equal(srv.mockDbData.reports.get(reportId1)?.status, "resolved");
        assert.equal(srv.mockDbData.reports.get(reportId2)?.status, "open");
    } finally {
        await srv.close();
    }
});

test("C. Scope separation: different drivers and vehicle scopes do not collide", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();

        // 1. Incident for Luka (Driver 1)
        const resLuka = await srv.request("/api/staff/operational-incidents", {
            method: "POST",
            token: "staff-token-disp-all",
            body: {
                affectedEntity: "driver",
                driverId: "drv-luka-1",
                date: today,
                reason: "Driver unavailable",
                shiftType: "morning",
                shiftName: "101.S01",
                bus: "101"
            }
        });
        assert.equal(resLuka.status, 201);

        // 2. Incident for Marko (Driver 2) on same date and group
        const resMarko = await srv.request("/api/staff/operational-incidents", {
            method: "POST",
            token: "staff-token-disp-all",
            body: {
                affectedEntity: "driver",
                driverId: "drv-marko-2",
                date: today,
                reason: "Driver unavailable",
                shiftType: "afternoon",
                shiftName: "101.S02",
                bus: "101"
            }
        });
        assert.equal(resMarko.status, 201);
        assert.notEqual(resLuka.json?.report?.id, resMarko.json?.report?.id, "Different drivers do not collide");
        assert.equal(srv.mockDbData.reports.size, 2);
    } finally {
        await srv.close();
    }
});

test("D. Legacy duplicate cleanup & complete audit payload verification", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();

        // Seed 3 existing reports for Luka: 1 primary + 2 legacy duplicates in group 101, plus 1 in group 102
        const primaryId = "rep-primary-1";
        const dup1Id = "rep-dup-1";
        const dup2Id = "rep-dup-2";
        const otherGroupId = "rep-group-102";

        srv.mockDbData.reports.set(primaryId, {
            id: primaryId,
            driverId: "drv-luka-1",
            date: today,
            groupId: "101",
            type: "coverage:disruption",
            status: "open",
            revision: 0
        });
        srv.mockDbData.reports.set(dup1Id, {
            id: dup1Id,
            driverId: "drv-luka-1",
            date: today,
            groupId: "101",
            type: "coverage:disruption",
            status: "open",
            revision: 0
        });
        srv.mockDbData.reports.set(dup2Id, {
            id: dup2Id,
            driverId: "drv-luka-1",
            date: today,
            groupId: "101",
            type: "coverage:disruption",
            status: "open",
            revision: 0
        });
        srv.mockDbData.reports.set(otherGroupId, {
            id: otherGroupId,
            driverId: "drv-luka-1",
            date: today,
            groupId: "102",
            type: "coverage:disruption",
            status: "open",
            revision: 0
        });

        // Resolve primary via dispatcher with group ["101"]
        const res = await srv.request(`/api/staff/operational-incidents/${primaryId}/resolve`, {
            method: "PUT",
            token: "staff-token-disp",
            body: { type: "available_again" }
        });
        assert.equal(res.status, 200);

        // Check primary and matching group-101 duplicates resolved
        assert.equal(srv.mockDbData.reports.get(primaryId)?.status, "resolved");
        assert.equal(srv.mockDbData.reports.get(dup1Id)?.status, "resolved");
        assert.equal(srv.mockDbData.reports.get(dup2Id)?.status, "resolved");

        // Unauthorized group-102 duplicate remains ACTIVE
        assert.equal(srv.mockDbData.reports.get(otherGroupId)?.status, "open", "Unauthorized group duplicate must not be touched");

        // Audit check: includes secondaryReportIds sorted
        const auditEntries = Array.from(srv.mockDbData.audit_log.values());
        const resolveAudit = auditEntries.find((a) => a.action === "operational_incident_resolved");
        assert.ok(resolveAudit, "Audit record exists");
        assert.equal(resolveAudit.actorId, "disp-uid-1");
        assert.equal(resolveAudit.details?.reportId, primaryId);
        assert.deepEqual(resolveAudit.details?.secondaryReportIds, [dup1Id, dup2Id].sort());
        assert.equal(resolveAudit.details?.resolutionType, "available_again");

        // Idempotent retry: adds NO additional audit entry
        const retry = await srv.request(`/api/staff/operational-incidents/${primaryId}/resolve`, {
            method: "PUT",
            token: "staff-token-disp",
            body: { type: "available_again" }
        });
        assert.equal(retry.status, 200);
        assert.equal(retry.json?.idempotent, true);
        assert.equal(Array.from(srv.mockDbData.audit_log.values()).filter((a) => a.action === "operational_incident_resolved").length, 1);
    } finally {
        await srv.close();
    }
});

test("E. Plan/shift/bus invariance and security validations", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        srv.mockDbData.shifts.set(`drv-luka-1_${today}`, {
            driverId: "drv-luka-1",
            driverName: "Luka Kovačević",
            date: today,
            type: "morning",
            name: "101.S01",
            bus: "101",
            revision: 1
        });

        // 1. Create incident
        const createRes = await srv.request("/api/staff/operational-incidents", {
            method: "POST",
            token: "staff-token-disp",
            body: {
                affectedEntity: "driver",
                driverId: "drv-luka-1",
                date: today,
                reason: "Driver unavailable",
                shiftType: "morning",
                shiftName: "101.S01",
                bus: "101"
            }
        });
        assert.equal(createRes.status, 201);
        const reportId = createRes.json?.report?.id;

        // Verify shift unchanged
        const shift1 = srv.mockDbData.shifts.get(`drv-luka-1_${today}`);
        assert.equal(shift1?.type, "morning");
        assert.equal(shift1?.bus, "101");

        // 2. Cross-tenant attempt fails closed
        const crossTenant = await srv.request(`/api/staff/operational-incidents/${reportId}/resolve`, {
            method: "PUT",
            token: "staff-token-foreign",
            body: { type: "available_again" }
        });
        assert.ok([403, 404].includes(crossTenant.status));

        // 3. Empty replacement fails 400
        const emptyRep = await srv.request(`/api/staff/operational-incidents/${reportId}/resolve`, {
            method: "PUT",
            token: "staff-token-disp",
            body: { type: "replacement", replacementDriverId: "", replacementBus: "" }
        });
        assert.equal(emptyRep.status, 400);
        assert.equal(emptyRep.json?.code, "INVALID_RESOLUTION");

        // 4. Resolve via available_again
        const resolveRes = await srv.request(`/api/staff/operational-incidents/${reportId}/resolve`, {
            method: "PUT",
            token: "staff-token-disp",
            body: { type: "available_again" }
        });
        assert.equal(resolveRes.status, 200);

        // Verify shift unchanged after resolution
        const shift2 = srv.mockDbData.shifts.get(`drv-luka-1_${today}`);
        assert.equal(shift2?.type, "morning");
        assert.equal(shift2?.bus, "101");
        assert.equal(shift2?.driverId, "drv-luka-1");
    } finally {
        await srv.close();
    }
});

test("translations contain exact localized strings for driver available again in sr, en, de", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const content = fs.readFileSync(path.resolve("translations.js"), "utf8");

    // Serbian
    assert.match(content, /ops_attn_driver_available_again:\s*"Vozač je ponovo dostupan"/);
    assert.match(content, /ops_coverage_available_success:\s*"Vozač je ponovo označen kao dostupan\."/);

    // English
    assert.match(content, /ops_attn_driver_available_again:\s*"Driver is available again"/);
    assert.match(content, /ops_coverage_available_success:\s*"Driver marked available again\."/);

    // German
    assert.match(content, /ops_attn_driver_available_again:\s*"Fahrer ist wieder verfügbar"/);
    assert.match(content, /ops_coverage_available_success:\s*"Fahrer wieder als verfügbar markiert\."/);
});

test("attention panel module exports resolveCoverageAvailableAgain and resolveCoverageAvailableAgainFromCard", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const attentionSrc = fs.readFileSync(path.resolve("js/dispatcher/ops-attention.js"), "utf8");
    const dashboardSrc = fs.readFileSync(path.resolve("js/dispatcher/dashboard.js"), "utf8");

    assert.match(attentionSrc, /export\s*\{[^}]*resolveCoverageAvailableAgain/);
    assert.match(attentionSrc, /export\s*\{[^}]*resolveCoverageAvailableAgainFromCard/);
    assert.match(attentionSrc, /seenCoverageKeys\.has\(coverageKey\)/, "Must deduplicate duplicate coverage incident cards");
    assert.match(attentionSrc, /ops-attention-available-again/, "Must render available-again action button");

    assert.match(dashboardSrc, /resolveModalCoverageAvailableAgain/, "Must wire modal available-again action");
    assert.match(dashboardSrc, /ops-coverage-available-again/, "Must render modal available-again button");
});
