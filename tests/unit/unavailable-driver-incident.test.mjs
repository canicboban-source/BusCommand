import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { registerDriverRoutes, setReplacementResolveHookForTests } from "../../server/driver-routes.js";

async function startTestServer() {
    const app = express();
    app.use(express.json());

    const mockDbData = {
        drivers: new Map([
            ["drv-luka-1", { id: "drv-luka-1", firstName: "Luka", lastName: "Kovačević", name: "Luka Kovačević", active: true, codeActivated: true, groupId: "101", lineId: "101", knownGroupIds: ["101"], companyId: "comp-1", postalCode: "1010", eid: "EID-LUKA-SECRET" }],
            ["drv-marko-2", { id: "drv-marko-2", firstName: "Marko", lastName: "Jovanović", name: "Marko Jovanović", active: true, codeActivated: true, groupId: "101", lineId: "101", knownGroupIds: ["101"], companyId: "comp-1", postalCode: "1010", eid: "EID-SECRET-4711", email: "marko@secret.test", pin: "9999" }],
            ["drv-foreign-9", { id: "drv-foreign-9", firstName: "Foreign", lastName: "Driver", name: "Foreign Driver", active: true, codeActivated: true, groupId: "102", lineId: "102", knownGroupIds: ["102"], companyId: "comp-2" }]
        ]),
        vacations: new Map(),
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
                        const match = filters.every(({ field: f, op: o, val: v }) => {
                            if (o === "==") return data[f] === v;
                            if (o === ">=") return data[f] >= v;
                            if (o === "<=") return data[f] <= v;
                            return false;
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

function todayDateStr(timeZone = "Europe/Vienna", date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
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

test("todayDateStr respects operational timezone across UTC midnight boundaries", () => {
    const simulatedUtcMidnightBoundary = new Date("2026-08-29T22:03:21Z");
    assert.equal(todayDateStr("Europe/Vienna", simulatedUtcMidnightBoundary), "2026-08-30");
    assert.equal(todayDateStr("UTC", simulatedUtcMidnightBoundary), "2026-08-29");
});

function seedCoverageResolve(srv, { today, reportId = "rep-cov-1", originalId = "drv-luka-1", extra = {} }) {
    srv.mockDbData.shifts.set(`${originalId}_${today}`, {
        driverId: originalId,
        date: today,
        type: "morning",
        name: "101.S01",
        routeCode: "101.S01",
        bus: "101",
        start: "05:00",
        end: "13:00",
        revision: 1
    });
    srv.mockDbData.reports.set(reportId, {
        id: reportId,
        driverId: originalId,
        date: today,
        groupId: "101",
        type: "coverage:disruption",
        status: "open",
        revision: 0,
        shiftType: "morning",
        shiftName: "101.S01",
        start: "05:00",
        end: "13:00",
        bus: "101",
        ...extra
    });
}

test("valid replacement updates daily and monthly plan and does not rewrite D+1", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        const [y, m, d] = today.split("-").map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        const tomorrow = next.toISOString().slice(0, 10);
        seedCoverageResolve(srv, { today });
        srv.mockDbData.shifts.set(`drv-marko-2_${tomorrow}`, {
            driverId: "drv-marko-2",
            date: tomorrow,
            type: "morning",
            start: "05:00",
            end: "13:00",
            revision: 3
        });
        const res = await srv.request("/api/staff/operational-incidents/rep-cov-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.status, 200, res.text);
        assert.equal(srv.mockDbData.shifts.get(`drv-marko-2_${today}`)?.type, "morning");
        assert.equal(srv.mockDbData.shifts.get(`drv-luka-1_${today}`), undefined);
        const month = today.slice(0, 7);
        const day = Number(today.slice(8, 10));
        const schedule = srv.mockDbData.schedules.get(`drv-marko-2_${month}`);
        assert.equal(schedule?.parsedShifts?.[day]?.type, "morning");
        assert.equal(srv.mockDbData.shifts.get(`drv-marko-2_${tomorrow}`)?.revision, 3);
        const audit = [...srv.mockDbData.audit_log.values()].find((row) => row.action === "operational_incident_resolved");
        const blob = JSON.stringify(audit);
        assert.equal(audit.details.eligibility.eligible, true);
        assert.equal(Object.prototype.hasOwnProperty.call(audit.details.eligibility, "samePlz"), false);
        assert.doesNotMatch(blob, /pin|otp|loginCodeHash|activationOtp|EID-SECRET/i);
    } finally {
        await srv.close();
    }
});

test("server rejects unknown group, inactive activation, and approved absence", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        seedCoverageResolve(srv, { today });
        srv.mockDbData.drivers.get("drv-marko-2").knownGroupIds = ["202"];
        srv.mockDbData.drivers.get("drv-marko-2").groupId = "202";
        srv.mockDbData.drivers.get("drv-marko-2").lineId = "202";
        let res = await srv.request("/api/staff/operational-incidents/rep-cov-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.status, 409);
        assert.equal(res.json.code, "REPLACEMENT_NOT_ELIGIBLE");
        assert.ok(res.json.blocks.includes("UNKNOWN_GROUP"));
        assert.equal(typeof res.json.error, "string");
        assert.doesNotMatch(JSON.stringify(res.json), /Marko|1010|otp|pin|EID-SECRET|secret\.test/i);

        srv.mockDbData.drivers.get("drv-marko-2").groupId = "101";
        srv.mockDbData.drivers.get("drv-marko-2").lineId = "101";
        srv.mockDbData.drivers.get("drv-marko-2").knownGroupIds = ["101"];
        srv.mockDbData.drivers.get("drv-marko-2").codeActivated = false;
        res = await srv.request("/api/staff/operational-incidents/rep-cov-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.json.blocks.includes("DRIVER_NOT_ACTIVATED"), true);

        srv.mockDbData.drivers.get("drv-marko-2").codeActivated = true;
        srv.mockDbData.vacations.set("vac-1", {
            driverId: "drv-marko-2",
            status: "approved",
            start: today,
            end: today
        });
        res = await srv.request("/api/staff/operational-incidents/rep-cov-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.ok(res.json.blocks.includes("APPROVED_ABSENCE"));
        assert.equal(srv.mockDbData.shifts.get("drv-luka-1_" + today)?.type, "morning");
    } finally {
        await srv.close();
    }
});

test("legacy missing codeActivated is a hard block; foreign-tenant leave does not affect an activated driver", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        seedCoverageResolve(srv, { today, reportId: "rep-legacy-1" });
        const marko = srv.mockDbData.drivers.get("drv-marko-2");
        delete marko.codeActivated;
        let res = await srv.request("/api/staff/operational-incidents/rep-legacy-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.status, 409);
        assert.ok(res.json.blocks.includes("DRIVER_NOT_ACTIVATED"));
        assert.doesNotMatch(JSON.stringify(res.json), /EID-SECRET|secret\.test|9999|loginCodeHash|activationOtp/i);

        marko.codeActivated = true;
        srv.mockDbData.vacations.set("vac-foreign", {
            driverId: "drv-marko-2",
            companyId: "comp-2",
            status: "approved",
            start: today,
            end: today
        });
        res = await srv.request("/api/staff/operational-incidents/rep-legacy-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.status, 200, res.text);
        const audit = [...srv.mockDbData.audit_log.values()].find((row) => row.action === "operational_incident_resolved");
        const blob = JSON.stringify({ body: res.json, audit });
        assert.equal(audit.details.eligibility.eligible, true);
        assert.doesNotMatch(blob, /EID-SECRET|secret\.test|9999|loginCodeHash|activationOtp/i);
    } finally {
        await srv.close();
    }
});

test("41 historical vacations do not hide the overlapping approved leave", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        seedCoverageResolve(srv, { today, reportId: "rep-hist-1" });
        for (let i = 0; i < 41; i += 1) {
            const day = String((i % 28) + 1).padStart(2, "0");
            const month = i < 28 ? "01" : "02";
            srv.mockDbData.vacations.set(`hist-${i}`, {
                driverId: "drv-marko-2",
                status: "approved",
                start: `2020-${month}-${day}`,
                end: `2020-${month}-${day}`
            });
        }
        srv.mockDbData.vacations.set("vac-relevant", {
            driverId: "drv-marko-2",
            status: "approved",
            start: today,
            end: today
        });
        const res = await srv.request("/api/staff/operational-incidents/rep-hist-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.status, 409);
        assert.ok(res.json.blocks.includes("APPROVED_ABSENCE"));
        assert.equal(srv.mockDbData.shifts.get("drv-luka-1_" + today)?.type, "morning");
    } finally {
        await srv.close();
    }
});

test("pending overlapping leave does not block replacement", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        seedCoverageResolve(srv, { today, reportId: "rep-pending-1" });
        srv.mockDbData.vacations.set("vac-pending", {
            driverId: "drv-marko-2",
            status: "pending",
            start: today,
            end: today
        });
        const res = await srv.request("/api/staff/operational-incidents/rep-pending-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.status, 200, res.text);
        assert.doesNotMatch(JSON.stringify(res.json), /EID-SECRET|loginCodeHash|activationOtp/i);
    } finally {
        await srv.close();
    }
});

test("concurrent leave approval during resolve blocks the replacement", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        seedCoverageResolve(srv, { today, reportId: "rep-race-1" });
        srv.mockDbData.vacations.set("vac-race", {
            driverId: "drv-marko-2",
            status: "pending",
            start: today,
            end: today
        });
        setReplacementResolveHookForTests(async () => {
            srv.mockDbData.vacations.get("vac-race").status = "approved";
        });
        const res = await srv.request("/api/staff/operational-incidents/rep-race-1/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: {
                type: "replacement",
                replacementDriverId: "drv-marko-2",
                replacementBus: "101",
                expectedOriginalRevision: 1,
                expectedReplacementRevision: 0
            }
        });
        assert.equal(res.status, 409);
        assert.ok(res.json.blocks.includes("APPROVED_ABSENCE"));
        assert.equal(srv.mockDbData.shifts.get("drv-luka-1_" + today)?.type, "morning");
        assert.doesNotMatch(JSON.stringify(res.json), /EID-SECRET|loginCodeHash|activationOtp|9999/i);
    } finally {
        setReplacementResolveHookForTests(null);
        await srv.close();
    }
});

test("second concurrent resolver loses the same eligible candidate", async () => {
    const srv = await startTestServer();
    try {
        const today = todayDateStr();
        srv.mockDbData.drivers.set("drv-petar-3", {
            id: "drv-petar-3",
            firstName: "Petar",
            lastName: "Ilić",
            active: true,
            codeActivated: true,
            groupId: "101",
            knownGroupIds: ["101"],
            companyId: "comp-1"
        });
        seedCoverageResolve(srv, { today, reportId: "rep-a", originalId: "drv-luka-1" });
        seedCoverageResolve(srv, { today, reportId: "rep-b", originalId: "drv-petar-3", extra: { bus: "102" } });
        srv.mockDbData.shifts.set(`drv-petar-3_${today}`, {
            ...(srv.mockDbData.shifts.get(`drv-petar-3_${today}`) || {}),
            bus: "102"
        });
        srv.mockDbData.buses.set("102", { number: "102", active: true, opsStatus: "active", groupId: "101" });
        const payload = {
            type: "replacement",
            replacementDriverId: "drv-marko-2",
            replacementBus: "101",
            expectedOriginalRevision: 1,
            expectedReplacementRevision: 0
        };
        const first = await srv.request("/api/staff/operational-incidents/rep-a/resolve", {
            method: "PUT", token: "staff-token-disp", body: payload
        });
        assert.equal(first.status, 200, first.text);
        const second = await srv.request("/api/staff/operational-incidents/rep-b/resolve", {
            method: "PUT", token: "staff-token-disp", body: payload
        });
        assert.equal(second.status, 409, second.text);
        assert.ok(
            ["REVISION_CONFLICT", "DRIVER_NOT_AVAILABLE", "BUS_NOT_AVAILABLE", "REPLACEMENT_NOT_ELIGIBLE", "DUTY_ALREADY_ASSIGNED"].includes(second.json.code),
            second.text
        );
        const retry = await srv.request("/api/staff/operational-incidents/rep-b/resolve", {
            method: "PUT",
            token: "staff-token-disp",
            body: { ...payload, expectedReplacementRevision: 1 }
        });
        assert.equal(retry.status, 409, retry.text);
        assert.ok(
            retry.json.code === "DRIVER_NOT_AVAILABLE"
            || retry.json.code === "REPLACEMENT_NOT_ELIGIBLE"
            || (retry.json.blocks || []).includes("DUTY_OVERLAP"),
            retry.text
        );
    } finally {
        await srv.close();
    }
});
