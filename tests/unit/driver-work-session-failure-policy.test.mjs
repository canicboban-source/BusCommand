import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";

const WORK_SESSION_FILE = new URL("../../js/driver/work-session.js", import.meta.url);
const WORK_SESSION_URL = WORK_SESSION_FILE.href;
const LOGIN_DRIVER = new URL("../../js/auth/login-driver.js", import.meta.url);
const BOOTSTRAP = new URL("../../js/bootstrap/init.js", import.meta.url);

let loadNonce = 0;
let mockBySpecifier = new Map();

registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL || "";
        if (parent === WORK_SESSION_URL || parent.startsWith(`${WORK_SESSION_URL}?`)) {
            const mapped = mockBySpecifier.get(specifier);
            if (mapped) return { url: mapped, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    }
});

function dataModule(source) {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
}

function createHarness() {
    return {
        apiCalls: 0,
        results: [],
        logout: 0,
        stopFirestoreSync: 0,
        stopGps: 0,
        gpsGate: [],
        clearUserSession: 0,
        showLoginScreen: [],
        toasts: [],
        tKeys: [],
        snapshots: [],
        clearCaches: 0
    };
}

function installMocks(h, { useLocalState = false } = {}) {
    globalThis.__BC_WIDE27_HARNESS__ = h;
    const n = ++loadNonce;
    mockBySpecifier = new Map([
        ["../core/auth-client.js", dataModule(`const Auth={logout:async()=>{globalThis.__BC_WIDE27_HARNESS__.logout+=1}};export default Auth;//${n}`)],
        ["../core/api-client.js", dataModule(`const ApiClient={getDriverWorkSession:async()=>{const h=globalThis.__BC_WIDE27_HARNESS__;h.apiCalls+=1;if(!h.results.length)throw new Error("no queued work-session result");return h.results.shift()},confirmDriverShifts:async()=>({success:true,confirmedDates:[]})};export default ApiClient;//${n}`)],
        ["../core/firebase-service.js", dataModule(`export function stopFirestoreSync(){globalThis.__BC_WIDE27_HARNESS__.stopFirestoreSync+=1}//${n}`)],
        ["../maps/gps-track.js", dataModule(`export function configureDriverGpsGate(gate={}){globalThis.__BC_WIDE27_HARNESS__.gpsGate.push({liveGps:gate.liveGps===true,sessionActive:gate.sessionActive===true})}export function stopDriverGpsTracking(){globalThis.__BC_WIDE27_HARNESS__.stopGps+=1}//${n}`)],
        ["../auth/login-session.js", dataModule(`export function clearUserSession(){globalThis.__BC_WIDE27_HARNESS__.clearUserSession+=1}//${n}`)],
        ["../auth/login-ui.js", dataModule(`export function showLoginScreen(v){globalThis.__BC_WIDE27_HARNESS__.showLoginScreen.push(v)}//${n}`)],
        ["../core/utils.js", dataModule(`export function showToast(msg,type){globalThis.__BC_WIDE27_HARNESS__.toasts.push({msg,type})}//${n}`)],
        ["../core/runtime-config.js", dataModule(`export const USE_LOCAL_STATE=${useLocalState ? "true" : "false"};//${n}`)],
        ["../ui/i18n.js", dataModule(`export function t(key){globalThis.__BC_WIDE27_HARNESS__.tKeys.push(key);return key}//${n}`)],
        ["./offline-snapshot.js", dataModule(`export function saveDriverOfflineSnapshot(payload){globalThis.__BC_WIDE27_HARNESS__.snapshots.push(payload)}export async function clearDriverSensitiveCaches(){globalThis.__BC_WIDE27_HARNESS__.clearCaches+=1}//${n}`)]
    ]);
}

async function loadWorkSession({ useLocalState = false } = {}) {
    const h = createHarness();
    globalThis.window = {
        currentUser: { role: "driver", id: "drv-1", uid: "drv-1", companyId: "co-1" },
        state: { messages: [] }
    };
    installMocks(h, { useLocalState });
    const mod = await import(`${WORK_SESSION_URL}?wide27=${loadNonce}`);
    return { h, mod };
}

function activePolicy(overrides = {}) {
    return {
        status: "active",
        notificationsUntil: new Date(Date.now() + 3_600_000).toISOString(),
        sessionEndsAt: new Date(Date.now() + 1_800_000).toISOString(),
        features: { liveGps: true },
        confirmationTargets: [{ date: "2026-09-14", confirmed: false, fingerprint: "fp-1" }],
        ...overrides
    };
}

function assertFullLogoutOnce(h) {
    assert.equal(h.logout, 1);
    assert.equal(h.clearUserSession, 1);
    assert.equal(h.clearCaches, 1);
    assert.equal(h.stopFirestoreSync, 1);
    assert.equal(h.showLoginScreen.length, 1);
    assert.equal(h.showLoginScreen[0], true);
    assert.equal(window.currentUser, null);
    assert.ok(h.tKeys.includes("driver_session_ended"));
}

function assertAuthPreserved(h) {
    assert.equal(h.logout, 0);
    assert.equal(h.clearUserSession, 0);
    assert.equal(h.clearCaches, 0);
    assert.equal(h.stopFirestoreSync, 0);
    assert.equal(h.showLoginScreen.length, 0);
    assert.equal(window.currentUser?.id, "drv-1");
}

function assertFailClosedGps(h, mod) {
    const lastGate = h.gpsGate[h.gpsGate.length - 1];
    assert.ok(lastGate, "GPS gate must be configured");
    assert.equal(lastGate.liveGps, false);
    assert.equal(lastGate.sessionActive, false);
    assert.ok(h.stopGps >= 1);
    assert.equal(mod.driverLiveGpsEnabled(), false);
    assert.equal(mod.isDriverWorkSessionActive(), false);
}

test("success result keeps existing work-session and GPS gate behavior", async () => {
    const { h, mod } = await loadWorkSession();
    const policy = activePolicy();
    h.results.push({ success: true, policy });
    const opened = await mod.prepareDriverWorkSession();
    assert.equal(opened, true);
    assert.equal(h.apiCalls, 1);
    assertAuthPreserved(h);
    assert.equal(mod.driverWorkPolicy()?.status, "active");
    assert.equal(mod.isDriverWorkSessionActive(), true);
    assert.equal(mod.driverLiveGpsEnabled(), true);
    assert.deepEqual(h.gpsGate.at(-1), { liveGps: true, sessionActive: true });
    assert.equal(h.snapshots.length, 1);
    assert.equal(h.snapshots[0].policy.status, "active");
    assert.equal(h.stopGps, 0);
});

test("HTTP 401 / INVALID_TOKEN performs exactly one full logout and returns false", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 401, code: "INVALID_TOKEN", error: "Nevažeći token." });
    const opened = await mod.prepareDriverWorkSession();
    assert.equal(opened, false);
    assert.equal(h.apiCalls, 1);
    assertFullLogoutOnce(h);
    assert.equal(mod.driverWorkPolicy(), null);
});

test("proven terminal 403 ACTIVATION_REQUIRED performs full logout", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({
        success: false,
        status: 403,
        code: "ACTIVATION_REQUIRED",
        error: "Aktivacija naloga je obavezna."
    });
    const opened = await mod.prepareDriverWorkSession();
    assert.equal(opened, false);
    assert.equal(h.apiCalls, 1);
    assertFullLogoutOnce(h);
});

test("NETWORK_ERROR status 0 keeps auth/local session and returns true", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 0, code: "NETWORK_ERROR", error: "Mrežna greška." });
    const opened = await mod.prepareDriverWorkSession();
    assert.equal(opened, true);
    assert.equal(h.apiCalls, 1);
    assertAuthPreserved(h);
    assertFailClosedGps(h, mod);
});

test("HTTP 429 does not log out", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 429, code: "RATE_LIMITED", error: "Prekoračen broj zahteva." });
    assert.equal(await mod.prepareDriverWorkSession(), true);
    assertAuthPreserved(h);
    assertFailClosedGps(h, mod);
});

test("HTTP 500 does not log out", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 500, code: "SERVICE_UNAVAILABLE", error: "Servis je trenutno nedostupan." });
    assert.equal(await mod.prepareDriverWorkSession(), true);
    assertAuthPreserved(h);
    assertFailClosedGps(h, mod);
});

test("HTTP 503 does not log out", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 503, code: "FIREBASE_UNAVAILABLE", error: "Firebase nije konfigurisan." });
    assert.equal(await mod.prepareDriverWorkSession(), true);
    assertAuthPreserved(h);
    assertFailClosedGps(h, mod);
});

test("INVALID_RESPONSE does not log out", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 200, code: "INVALID_RESPONSE", error: "Nevalidan odgovor servera." });
    assert.equal(await mod.prepareDriverWorkSession(), true);
    assertAuthPreserved(h);
    assertFailClosedGps(h, mod);
});

test("transient failure does not apply result.policy", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({
        success: false,
        status: 500,
        code: "SERVICE_UNAVAILABLE",
        policy: activePolicy({
            confirmationTargets: [{ date: "2099-01-01", confirmed: false, fingerprint: "poison" }]
        })
    });
    assert.equal(await mod.prepareDriverWorkSession(), true);
    const policy = mod.driverWorkPolicy();
    assert.notEqual(policy?.status, "active");
    assert.notEqual(policy?.status, "grace");
    assert.equal(policy?.features?.liveGps, false);
    assert.equal(policy?.confirmationTargets, undefined);
    assert.equal(h.snapshots.length, 0);
});

test("previous active/grace policy is no longer active after a transient failure", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: true, policy: activePolicy() });
    h.results.push({
        success: false,
        status: 0,
        code: "NETWORK_ERROR",
        policy: activePolicy({ status: "grace" })
    });
    assert.equal(await mod.prepareDriverWorkSession(), true);
    assert.equal(mod.isDriverWorkSessionActive(), true);
    assert.equal(await mod.prepareDriverWorkSession(), true);
    const policy = mod.driverWorkPolicy();
    assert.notEqual(policy?.status, "active");
    assert.notEqual(policy?.status, "grace");
    assert.equal(mod.isDriverWorkSessionActive(), false);
    assertFailClosedGps(h, mod);
    assert.equal(h.snapshots.length, 1, "failed payload must not overwrite a good offline snapshot");
});

test("transient GPS gate is liveGps:false and sessionActive:false", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 429, code: "RATE_LIMITED" });
    await mod.prepareDriverWorkSession();
    assert.deepEqual(h.gpsGate.at(-1), { liveGps: false, sessionActive: false });
});

test("transient failure stops GPS tracking", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 503, code: "SERVICE_UNAVAILABLE" });
    await mod.prepareDriverWorkSession();
    assert.ok(h.stopGps >= 1);
});

test("transient branch does not clear cache, session, Auth, login screen, or Firestore", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 500, error: "Radna sesija nije mogla biti proverena." });
    await mod.prepareDriverWorkSession();
    assertAuthPreserved(h);
});

test("failure path does not retry or issue an extra API call", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: false, status: 0, code: "NETWORK_ERROR" });
    await mod.prepareDriverWorkSession();
    assert.equal(h.apiCalls, 1);
    assert.equal(h.results.length, 0);
});

test("TOKEN_LOOKUP_ERROR status 0 keeps driver login and fail-closes work policy", async () => {
    const { h, mod } = await loadWorkSession();
    h.results.push({ success: true, policy: activePolicy() });
    h.results.push({ success: false, status: 0, code: "TOKEN_LOOKUP_ERROR" });
    assert.equal(await mod.prepareDriverWorkSession(), true);
    assert.equal(mod.isDriverWorkSessionActive(), true);
    assert.equal(await mod.prepareDriverWorkSession(), true);
    assertAuthPreserved(h);
    assertFailClosedGps(h, mod);
    const policy = mod.driverWorkPolicy();
    assert.notEqual(policy?.status, "active");
    assert.notEqual(policy?.status, "grace");
    assert.equal(h.logout, 0);
    assert.equal(h.apiCalls, 2);
    assert.equal(h.results.length, 0);
    assert.equal(h.snapshots.length, 1);
});

test("USE_LOCAL_STATE still opens without calling the work-session API", async () => {
    const { h, mod } = await loadWorkSession({ useLocalState: true });
    const opened = await mod.prepareDriverWorkSession();
    assert.equal(opened, true);
    assert.equal(h.apiCalls, 0);
    assertAuthPreserved(h);
    assert.equal(h.gpsGate.length, 0);
    assert.equal(h.stopGps, 0);
    assert.equal(mod.driverWorkPolicy(), null);
});

test("source still terminates only on the allowlisted auth path; login/bootstrap still honor false", async () => {
    const [workSession, loginDriver, bootstrap] = await Promise.all([
        readFile(WORK_SESSION_FILE, "utf8"),
        readFile(LOGIN_DRIVER, "utf8"),
        readFile(BOOTSTRAP, "utf8")
    ]);
    assert.match(workSession, /function isTerminalDriverSessionFailure\(result\)/);
    assert.match(workSession, /status === 401/);
    assert.match(workSession, /ACTIVATION_REQUIRED/);
    assert.match(workSession, /await terminateDriverSession\("driver_session_ended"\)/);
    assert.match(workSession, /applyFailClosedWorkPolicy\(\)/);
    assert.doesNotMatch(workSession, /if \(!result\.success\) \{\s*policy = result\.policy/);
    assert.match(loginDriver, /if \(!\(await prepareDriverWorkSession\(\)\)\) return;/);
    assert.match(bootstrap, /if \(authUser\.role === "driver" && isDriverSurface\(\) && !\(await prepareDriverWorkSession\(\)\)\)/);
});
