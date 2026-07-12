// BusCommand ESM — Firebase Firestore sync

import { getBaseState, getStateStorageKey } from "./state.js";
import { showToast } from "./utils.js";
import { IS_DEMO_MODE } from "./runtime-config.js";
import {
    diffCollectionOps,
    chunkArray,
    summarizeAuditChanges,
    hasAuditActivity,
    idsFromList
} from "./firestore-sync.js";

const firebaseConfig = {
    apiKey:            "AIzaSyBHW2NyhdXhg48tuzOhUsDJns4m2a6obQE",
    authDomain:        "transitflow-prod.firebaseapp.com",
    projectId:         "transitflow-prod",
    storageBucket:     "transitflow-prod.firebasestorage.app",
    messagingSenderId: "902580554748",
    appId:             "1:902580554748:web:f122ad5654e0c3ff16c079",
    measurementId:     "G-XZ7W37K4SM"
};

firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const _auth = firebase.auth();

let _firestoreListeners = [];
let _firebaseReady     = false;
let _collectionBaselines = {};
let _baselineReady = {};
let _lastSosSnapshot = null;

const GRANULAR_COLLECTIONS = [
    { key: "groups",        col: "groups" },
    { key: "dispatchers",   col: "users" },
    { key: "drivers",       col: "drivers" },
    { key: "shifts",        col: "shifts" },
    { key: "messages",      col: "messages" },
    { key: "buses",         col: "buses" },
    { key: "routes",        col: "routes" },
    { key: "reports",       col: "reports" },
    { key: "vacations",     col: "vacations" },
    { key: "lostItems",     col: "lost_items" },
    { key: "schedules",     col: "schedules" },
    { key: "companyAdmins", col: "company_admins" }
];

function _baseState() {
    return getBaseState();
}

function isFirebaseReady() { return _firebaseReady; }

function _resetSyncBaselines(stateObj) {
    _collectionBaselines = {};
    _baselineReady = {};
    for (const item of GRANULAR_COLLECTIONS) {
        _markBaselineFromList(item.key, stateObj[item.key] || []);
    }
}

function _markBaselineFromList(itemKey, list) {
    _collectionBaselines[itemKey] = idsFromList(list);
    _baselineReady[itemKey] = true;
}

function _baselineFor(itemKey) {
    return _baselineReady[itemKey] ? _collectionBaselines[itemKey] : null;
}

async function logClientAuditEvent(companyId, action, details = {}) {
    if (!companyId || IS_DEMO_MODE) return;
    const user = window.currentUser;
    const actorId = user?.uid || user?.id || user?.email || "unknown";
    try {
        await db.collection("companies").doc(companyId).collection("audit_log").add({
            action,
            actorId,
            actorRole: user?.role || null,
            actorName: user?.name || null,
            details,
            source: "client",
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.warn("Audit log failed:", err.message);
    }
}

async function _commitWriteOps(writeOps) {
    const chunks = chunkArray(writeOps);
    for (const chunk of chunks) {
        const batch = db.batch();
        for (const op of chunk) {
            if (op.type === "set") {
                batch.set(op.ref, op.data, op.options || { merge: true });
            } else if (op.type === "delete") {
                batch.delete(op.ref);
            }
        }
        await batch.commit();
    }
}

async function loadStateFromFirestore(companyId) {
    if (!companyId) return null;
    try {
        const companyRef = db.collection("companies").doc(companyId);

        const profileSnap = await companyRef.collection("profile").doc("main").get();
        const brandingSnap = await companyRef.collection("branding").doc("main").get();
        const settingsSnap = await companyRef.collection("settings").doc("main").get();

        const loadedState = {
            branding: brandingSnap.exists ? brandingSnap.data() : {},
            settings: settingsSnap.exists ? settingsSnap.data() : {},
            profile: profileSnap.exists ? profileSnap.data() : {}
        };

        for (const item of GRANULAR_COLLECTIONS) {
            const colSnap = await companyRef.collection(item.col).get();
            loadedState[item.key] = colSnap.docs.map(doc => {
                const data = doc.data();
                if (!data.id) data.id = doc.id;
                return data;
            });
        }

        const sosSnap = await companyRef.collection("settings").doc("sos").get();
        if (sosSnap.exists) {
            const sosData = sosSnap.data();
            loadedState.sosActive = sosData.sosActive || false;
            loadedState.sosDriver = sosData.sosDriver || "";
            loadedState.sosBus = sosData.sosBus || "";
            _lastSosSnapshot = {
                sosActive: loadedState.sosActive,
                sosDriver: loadedState.sosDriver,
                sosBus: loadedState.sosBus
            };
        }

        console.log("✅ Firebase: Granular State loaded for", companyId);
        return loadedState;
    } catch (err) {
        console.warn("⚠️ Firebase: Firestore granular load failed:", err);
        return null;
    }
}

async function saveStateToFirestore(stateObj, companyId) {
    if (!companyId) return;

    const companyRef = db.collection("companies").doc(companyId);
    const writeOps = [];
    const auditByKey = {};

    try {
        if (stateObj.branding) {
            writeOps.push({
                type: "set",
                ref: companyRef.collection("branding").doc("main"),
                data: stateObj.branding
            });
        }
        if (stateObj.settings) {
            writeOps.push({
                type: "set",
                ref: companyRef.collection("settings").doc("main"),
                data: stateObj.settings
            });
        }
        if (stateObj.profile) {
            writeOps.push({
                type: "set",
                ref: companyRef.collection("profile").doc("main"),
                data: stateObj.profile
            });
        }

        const sosPayload = {
            sosActive: stateObj.sosActive || false,
            sosDriver: stateObj.sosDriver || "",
            sosBus: stateObj.sosBus || ""
        };
        writeOps.push({
            type: "set",
            ref: companyRef.collection("settings").doc("sos"),
            data: sosPayload
        });

        const sosChanged = !_lastSosSnapshot ||
            _lastSosSnapshot.sosActive !== sosPayload.sosActive ||
            _lastSosSnapshot.sosDriver !== sosPayload.sosDriver ||
            _lastSosSnapshot.sosBus !== sosPayload.sosBus;

        for (const item of GRANULAR_COLLECTIONS) {
            const localList = stateObj[item.key] || [];
            const collectionRef = companyRef.collection(item.col);
            const baseline = _baselineFor(item.key);
            const { sets, deletes, localIds, audit } = diffCollectionOps(localList, baseline);

            for (const entry of sets) {
                writeOps.push({
                    type: "set",
                    ref: collectionRef.doc(entry.id),
                    data: entry.data
                });
            }
            for (const idToDelete of deletes) {
                writeOps.push({
                    type: "delete",
                    ref: collectionRef.doc(idToDelete)
                });
            }

            auditByKey[item.key] = baseline ? audit : {
                added: [], updated: [], removed: []
            };
            _collectionBaselines[item.key] = localIds;
            _baselineReady[item.key] = true;
        }

        if (writeOps.length === 0) return;

        await _commitWriteOps(writeOps);

        _lastSosSnapshot = { ...sosPayload };

        const auditSummary = summarizeAuditChanges(auditByKey);
        if (hasAuditActivity(auditSummary, { sosChanged })) {
            await logClientAuditEvent(companyId, "state_sync", {
                collections: auditSummary,
                sosChanged
            });
        }

        console.log("✅ Firebase: State synced (batch) for", companyId, `ops=${writeOps.length}`);
    } catch (err) {
        console.warn("⚠️ Firebase: Sync error:", err);
    }
}

async function _invokeRender(modulePath, exportName) {
    try {
        const mod = await import(modulePath);
        const fn = mod[exportName];
        if (typeof fn === "function") fn();
    } catch (err) {
        console.warn("Firebase render callback failed:", exportName, err);
    }
}

function _handleRemoteCollectionUpdate(itemKey) {
    const user = window.currentUser;
    if (!user) return;

    if (itemKey === "messages" && user.role === "driver") {
        _invokeRender("../driver/messages-inbox.js", "renderDriverMessages");
    }
    if (itemKey === "shifts") {
        if (user.role === "dispatcher") {
            const active = document.querySelector(".content-section:not(.hidden)");
            if (active && active.id === "dispatcher-shifts") {
                _invokeRender("../dispatcher/shifts.js", "renderDispatcherShifts");
            }
        }
        if (user.role === "driver") {
            _invokeRender("../driver/dashboard.js", "renderDriverDashboard");
        }
    }
    if (itemKey === "drivers" && user.role === "dispatcher") {
        const active = document.querySelector(".content-section:not(.hidden)");
        if (active && active.id === "dispatcher-dashboard") {
            _invokeRender("../dispatcher/dashboard.js", "renderDispatcherDashboard");
        }
    }
}

function startFirestoreSync(companyId) {
    if (_firestoreListeners.length > 0) return;
    if (!companyId) return;

    const companyRef = db.collection("companies").doc(companyId);

    const sosListener = companyRef.collection("settings").doc("sos").onSnapshot(async (snap) => {
        if (!snap.exists) return;
        const data = snap.data();
        const sosChanged = window.state.sosActive !== data.sosActive;

        window.state.sosActive = data.sosActive || false;
        window.state.sosDriver = data.sosDriver || "";
        window.state.sosBus = data.sosBus || "";
        _lastSosSnapshot = {
            sosActive: window.state.sosActive,
            sosDriver: window.state.sosDriver,
            sosBus: window.state.sosBus
        };

        if (sosChanged && window.currentUser) {
            const { checkSOSStatus } = await import("../maps/sos-siren.js");
            checkSOSStatus();
            if (window.state.sosActive && window.currentUser.role === "dispatcher") {
                showToast("🚨 SOS ALARM primljen!", "error", 8000);
            }
        }
    });
    _firestoreListeners.push(sosListener);

    GRANULAR_COLLECTIONS.forEach(item => {
        const listener = companyRef.collection(item.col).onSnapshot((snap) => {
            if (snap.metadata.hasPendingWrites) return;

            const updatedList = snap.docs.map(doc => {
                const d = doc.data();
                if (!d.id) d.id = doc.id;
                return d;
            });

            const changed = JSON.stringify(window.state[item.key]) !== JSON.stringify(updatedList);
            if (!changed) return;

            console.log(`🔄 Firebase: Remote update for ${item.key}`);
            window.state[item.key] = updatedList;
            _markBaselineFromList(item.key, updatedList);
            _handleRemoteCollectionUpdate(item.key);

            localStorage.setItem(
                getStateStorageKey(companyId),
                JSON.stringify(window.state)
            );
        });

        _firestoreListeners.push(listener);
    });

    console.log("✅ Firebase: Real-time granular sync active for", companyId);
    showFirebaseStatus("online");
}

function stopFirestoreSync() {
    _firestoreListeners.forEach(unsub => unsub());
    _firestoreListeners = [];
    _collectionBaselines = {};
    _baselineReady = {};
    _lastSosSnapshot = null;
}

function showFirebaseStatus(status) {
    let indicator = document.getElementById("firebase-status-dot");
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.id = "firebase-status-dot";
        indicator.style.cssText = `
            position: fixed; bottom: 12px; left: 12px; z-index: 9000;
            display: flex; align-items: center; gap: 6px;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
            border-radius: 20px; padding: 5px 10px 5px 8px;
            font-size: 11px; font-family: 'Outfit', sans-serif;
            border: 1px solid rgba(255,255,255,0.1);
            transition: all 0.3s ease; pointer-events: none;
        `;
        document.body.appendChild(indicator);
    }

    indicator.innerHTML = status === "online"
        ? `<span style="width:8px;height:8px;border-radius:50%;background:#10b981;
               box-shadow:0 0 6px rgba(16,185,129,0.8);display:inline-block;"></span>
           <span style="color:rgba(255,255,255,0.7);">Firebase sync</span>`
        : `<span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;
               box-shadow:0 0 6px rgba(245,158,11,0.8);display:inline-block;"></span>
           <span style="color:rgba(255,255,255,0.7);">Offline mode</span>`;
}

async function initFirebase(companyId) {
    _firebaseReady = false;
    showFirebaseStatus("offline");

    try {
        const cloudState = await loadStateFromFirestore(companyId);

        if (cloudState) {
            window.state = { ..._baseState(), ...cloudState };
            _resetSyncBaselines(window.state);
        } else {
            const localKey   = getStateStorageKey(companyId);
            const localSaved = localStorage.getItem(localKey);
            if (localSaved) {
                try { window.state = { ..._baseState(), ...JSON.parse(localSaved) }; }
                catch (_err) { window.state = { ..._baseState() }; }
            } else {
                window.state = { ..._baseState() };
            }
            _resetSyncBaselines(window.state);
            await saveStateToFirestore(window.state, companyId);
        }

        _firebaseReady = true;
        startFirestoreSync(companyId);

    } catch (err) {
        console.error("❌ Firebase init error:", err);
        const localKey = getStateStorageKey(companyId);
        const localSaved = localStorage.getItem(localKey);
        if (localSaved) {
            try { window.state = { ..._baseState(), ...JSON.parse(localSaved) }; }
            catch (_err) { window.state = { ..._baseState() }; }
        } else {
            window.state = { ..._baseState() };
        }
        _resetSyncBaselines(window.state);
        showFirebaseStatus("offline");
    }

    return window.state;
}

export {
    isFirebaseReady,
    loadStateFromFirestore,
    saveStateToFirestore,
    logClientAuditEvent,
    startFirestoreSync,
    stopFirestoreSync,
    showFirebaseStatus,
    initFirebase
};
