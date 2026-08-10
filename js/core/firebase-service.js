// BusCommand ESM — Firebase Firestore sync

import { getBaseState, getStateStorageKey, clearAllTenantStateCaches, applyUiLanguagePreference } from "./state.js";
import { showToast } from "./utils.js";
import { USE_LOCAL_STATE } from "./runtime-config.js";
import { t } from "../ui/i18n.js";
import {
    EXPECTED_FIREBASE_PROJECT_ID,
    readFirebaseWebConfig,
    validateFirebaseWebConfig
} from "./firebase-web-config.js";
import {
    diffCollectionOps,
    chunkArray,
    summarizeAuditChanges,
    hasAuditActivity,
    idsFromList
} from "./firestore-sync.js";
import { resolveDispatcherGroupIds, filterAssignedGroups } from "./dispatcher-scope.js";
import { isGranularCollectionAllowed } from "./firestore-load-policy.js";
import ApiClient from "./api-client.js";
import { checkSOSStatus } from "../maps/sos-siren.js";

let db = null;

function initializeFirebaseClient() {
    if (USE_LOCAL_STATE) return null;

    const firebaseConfig = readFirebaseWebConfig();
    const validation = validateFirebaseWebConfig(firebaseConfig);
    if (!validation.valid) throw new Error(validation.error);
    if (typeof firebase === "undefined") throw new Error("Firebase browser SDK is unavailable.");

    if (firebase.apps.length) {
        const activeProjectId = firebase.app().options.projectId;
        if (activeProjectId !== EXPECTED_FIREBASE_PROJECT_ID) {
            throw new Error(`Refusing to use Firebase project ${activeProjectId || "unknown"}.`);
        }
    } else {
        firebase.initializeApp(firebaseConfig);
    }
    db = firebase.firestore();
    return db;
}

let _firestoreListeners = [];
let _firebaseReady     = false;
let _collectionBaselines = {};
let _baselineReady = {};
let _lastSosSnapshot = null;
let _dispatcherGroupListeners = [];

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

const DISPATCHER_GROUP_SCOPED_KEYS = new Set([
    "drivers", "shifts", "messages", "buses", "routes",
    "reports", "vacations", "lostItems", "schedules"
]);

function _baseState() {
    return getBaseState();
}

function isFirebaseReady() { return _firebaseReady; }

function _isDriverSession() {
    return window.currentUser?.role === "driver";
}

function _isDispatcherSession() {
    return window.currentUser?.role === "dispatcher";
}

function _currentRole() {
    return window.currentUser?.role || null;
}

function _staffUid() {
    return window.currentUser?.uid || window.currentUser?.id || null;
}

function _dispatcherAssignedGroupIds() {
    return [...new Set(
        (Array.isArray(window.currentUser?.groups) ? window.currentUser.groups : [])
            .map(String)
            .map(groupId => groupId.trim())
            .filter(Boolean)
    )];
}

async function _loadDispatcherProfileAndGroups(companyRef, companyId) {
    const uid = _staffUid();
    if (!uid) throw new Error("Dispatcher UID is missing.");
    const profilePath = `${companyRef.path}/users/${uid}`;
    const profileSnap = await _readFirestoreOperation(
        "load_own_user_profile", profilePath,
        () => companyRef.collection("users").doc(uid).get()
    );
    const profile = profileSnap.exists ? profileSnap.data() : null;
    const assignedIds = resolveDispatcherGroupIds({
        profileExists: profileSnap.exists,
        profileGroups: profile?.groups,
        claimGroups: window.currentUser?.groups
    });
    const groupSnaps = await Promise.all(assignedIds.map(id => _readFirestoreOperation(
        "load_assigned_group", `${companyRef.path}/groups/${id}`,
        () => companyRef.collection("groups").doc(id).get()
    )));
    const groups = filterAssignedGroups(groupSnaps
        .filter(snapshot => snapshot.exists)
        .map(snapshot => ({ ...snapshot.data(), id: snapshot.id, companyId })), assignedIds, companyId);
    window.currentUser.groups = groups.map(group => group.id);
    window.currentUser.activeGroupId = window.currentUser.groups.includes(window.currentUser.activeGroupId)
        ? window.currentUser.activeGroupId
        : (window.currentUser.groups[0] || null);
    return {
        dispatchers: profile ? [{ ...profile, id: uid, companyId, groups: window.currentUser.groups }] : [],
        groups
    };
}

function _driverUid() {
    return window.currentUser?.uid || window.currentUser?.id || null;
}

function _docsToList(docs, companyId = null) {
    return docs.map(doc => {
        const data = { ...doc.data(), id: doc.data().id || doc.id };
        // Tenant collections are stored under companies/{companyId}/... and often omit
        // companyId in the document body. Stamp it so CA team/group filters work after reload.
        if (companyId) data.companyId = companyId;
        return data;
    });
}

const DISPATCHER_DRIVER_SENSITIVE = Object.freeze([
    "eid", "pin", "password", "passwordHash", "companyId", "company_code", "companyCode",
    "personalCode", "loginCode", "activationCode", "otp"
]);

/** Dispatcher may only keep contact + assignment fields — never EID/PIN. */
function sanitizeDriverRecordForClient(driver, role) {
    const raw = driver && typeof driver === "object" ? driver : {};
    const name = String(raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(" ")).trim();
    if (role !== "dispatcher") {
        return name && !raw.name ? { ...raw, name } : raw;
    }
    const firstName = String(raw.firstName || "").trim();
    const lastName = String(raw.lastName || "").trim();
    return {
        id: raw.id,
        name: name || [firstName, lastName].filter(Boolean).join(" ") || "—",
        firstName,
        lastName,
        phone: String(raw.phone || "").trim(),
        email: String(raw.email || "").trim(),
        groupId: raw.groupId || raw.lineId || "",
        lineId: raw.lineId || raw.groupId || "",
        bus: raw.bus || "",
        active: raw.active !== false
    };
}

function _docsToDriversList(docs, companyId = null) {
    const role = _currentRole();
    return _docsToList(docs, companyId).map((driver) => {
        const sanitized = sanitizeDriverRecordForClient(driver, role);
        if (role === "dispatcher") {
            DISPATCHER_DRIVER_SENSITIVE.forEach((field) => {
                if (Object.hasOwn(sanitized, field)) delete sanitized[field];
            });
        }
        return sanitized;
    });
}

async function _readFirestoreOperation(operation, path, reader) {
    try {
        return await reader();
    } catch (error) {
        const code = error?.code || "unknown";
        console.warn(`Firebase read denied or failed | operation=${operation} | path=${path} | code=${code}`);
        if (error && typeof error === "object") {
            error.busCommandOperation = operation;
            error.busCommandPath = path;
        }
        throw error;
    }
}

async function _loadAllowedCollection(companyRef, item) {
    const companyId = companyRef.id;
    if (!isGranularCollectionAllowed(_currentRole(), item.key)) return [];
    if (_isDispatcherSession() && DISPATCHER_GROUP_SCOPED_KEYS.has(item.key)) {
        const assignedIds = _dispatcherAssignedGroupIds();
        if (assignedIds.length === 0) return [];

        // Home groupId only — knownGroupIds must not open a company directory (FAZA 1 / D18).
        const snapshots = await Promise.all(assignedIds.map((groupId) =>
            _readFirestoreOperation(
                `load_assigned_${item.key}`, `${companyRef.path}/${item.col}?groupId=${groupId}`,
                () => companyRef.collection(item.col).where("groupId", "==", groupId).get()
            )
        ));
        const unique = new Map();
        snapshots.flatMap(snapshot => snapshot.docs).forEach(doc => unique.set(doc.id, doc));
        return item.key === "drivers"
            ? _docsToDriversList([...unique.values()], companyId)
            : _docsToList([...unique.values()], companyId);
    }
    if (!_isDriverSession()) {
        const snapshot = await _readFirestoreOperation(
            `load_${item.key}`, `${companyRef.path}/${item.col}`,
            () => companyRef.collection(item.col).get()
        );
        return item.key === "drivers"
            ? _docsToDriversList(snapshot.docs, companyId)
            : _docsToList(snapshot.docs, companyId);
    }
    const uid = _driverUid();
    const homeGroupId = String(window.currentUser?.groupId || window.currentUser?.lineId || "").trim();
    if (item.key === "drivers") {
        const snap = await companyRef.collection("drivers").doc(uid).get();
        return snap.exists ? _docsToDriversList([snap], companyId) : [];
    }
    if (item.key === "messages") {
        const messages = companyRef.collection("messages");
        const [privateSnap, broadcastSnap] = await Promise.all([
            messages.where("recipientDriverId", "==", uid).get(),
            messages.where("broadcast", "==", true).get()
        ]);
        const unique = new Map();
        [...privateSnap.docs, ...broadcastSnap.docs].forEach(doc => unique.set(doc.id, doc));
        return _docsToList([...unique.values()], companyId);
    }
    if (item.key === "reports" || item.key === "vacations" || item.key === "lostItems"
        || item.key === "shifts" || item.key === "schedules") {
        const snapshot = await companyRef.collection(item.col).where("driverId", "==", uid).get();
        return _docsToList(snapshot.docs, companyId);
    }
    if (item.key === "buses" || item.key === "routes") {
        if (!homeGroupId) return [];
        const snapshot = await companyRef.collection(item.col).where("groupId", "==", homeGroupId).get();
        return _docsToList(snapshot.docs, companyId);
    }
    if (item.key === "dispatchers" || item.key === "companyAdmins") return [];
    return [];
}

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

/** Mark server-created docs so later client updates (e.g. soft-archive) can sync. */
function acknowledgeServerCreatedIds(itemKey, ids) {
    const next = new Set(_baselineReady[itemKey] ? _collectionBaselines[itemKey] : []);
    for (const id of ids || []) {
        if (id) next.add(String(id));
    }
    _collectionBaselines[itemKey] = next;
    _baselineReady[itemKey] = true;
}

function _baselineFor(itemKey) {
    return _baselineReady[itemKey] ? _collectionBaselines[itemKey] : null;
}

async function logClientAuditEvent(companyId, action, details = {}) {
    if (!companyId || USE_LOCAL_STATE || action !== "state_sync") return;
    try {
        const result = await ApiClient.reportStateSync(details);
        if (!result.success) throw new Error(result.error || "Audit endpoint failed");
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

        const profileSnap = await _readFirestoreOperation("load_company_profile", `${companyRef.path}/profile/main`, () => companyRef.collection("profile").doc("main").get());
        const brandingSnap = await _readFirestoreOperation("load_branding", `${companyRef.path}/branding/main`, () => companyRef.collection("branding").doc("main").get());
        const settingsSnap = await _readFirestoreOperation("load_settings", `${companyRef.path}/settings/main`, () => companyRef.collection("settings").doc("main").get());

        const loadedState = {
            branding: brandingSnap.exists ? brandingSnap.data() : {},
            settings: settingsSnap.exists ? settingsSnap.data() : {},
            profile: profileSnap.exists ? profileSnap.data() : {}
        };

        const dispatcherAccess = _isDispatcherSession()
            ? await _loadDispatcherProfileAndGroups(companyRef, companyId)
            : null;

        for (const item of GRANULAR_COLLECTIONS) {
            if (dispatcherAccess && (item.key === "groups" || item.key === "dispatchers")) {
                loadedState[item.key] = dispatcherAccess[item.key];
            } else if (!isGranularCollectionAllowed(_currentRole(), item.key)) {
                loadedState[item.key] = [];
            } else if (item.key === "companyAdmins") {
                // Real company admins live in users/ with role company_admin.
                // The legacy company_admins collection is unused — filled below from users.
                loadedState[item.key] = [];
            } else {
                loadedState[item.key] = await _loadAllowedCollection(companyRef, item);
            }
        }

        // users/ holds both dispatchers and company admins — split after load so KPI/team match.
        if (Array.isArray(loadedState.dispatchers)) {
            const staffUsers = loadedState.dispatchers;
            loadedState.companyAdmins = staffUsers.filter((user) =>
                user.role === "company_admin" || user.role === "company-admin"
            );
            loadedState.dispatchers = staffUsers.filter((user) =>
                user.role !== "company_admin" && user.role !== "company-admin"
            );
        }

        try {
            const sosSnap = await _readFirestoreOperation(
                "load_sos_settings", `${companyRef.path}/settings/sos`,
                () => companyRef.collection("settings").doc("sos").get()
            );
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
        } catch (sosErr) {
            // Cross-group active SOS is denied for Dispo — fail closed (no oracle toast).
            loadedState.sosActive = false;
            loadedState.sosDriver = "";
            loadedState.sosBus = "";
            console.warn(`Firebase SOS settings unavailable | code=${sosErr?.code || "unknown"}`);
        }

        console.log("✅ Firebase: Granular State loaded for", companyId);
        return loadedState;
    } catch (err) {
        console.warn(
            `Firebase granular load failed | operation=${err?.busCommandOperation || "unknown"}`
            + ` | path=${err?.busCommandPath || "unknown"} | code=${err?.code || "unknown"}`
        );
        throw err;
    }
}

async function saveStateToFirestore(stateObj, companyId) {
    if (!companyId) return;

    const companyRef = db.collection("companies").doc(companyId);
    const writeOps = [];
    const auditByKey = {};

    try {
        // Company profile, branding, license/settings, SOS and reports are server-owned.
        // Their dedicated APIs validate tenant, payload, lifecycle and audit trail.
        const sosChanged = false;

        for (const item of GRANULAR_COLLECTIONS) {
            // Company groups are written only through the validated Company Admin API.
            // Dispatcher accounts are provisioned and changed only through the server.
            // Driver profiles/credentials: import + status APIs only (never client PIN/CRUD).
            // Shifts/schedules: only PUT /api/staff/shifts/assignment (revision + Admin SDK).
            // Messages: create/read/ack/archive only via staff/driver APIs (§12 — no client mutate).
            if (item.key === "messages" || item.key === "groups" || item.key === "dispatchers" || item.key === "reports" || item.key === "drivers" || item.key === "lostItems" || item.key === "buses" || item.key === "routes" || item.key === "shifts" || item.key === "schedules") continue;
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
    if (itemKey === "reports" && user.role === "dispatcher") {
        const active = document.querySelector(".content-section:not(.hidden)");
        if (active?.id === "dispatcher-dashboard") {
            _invokeRender("../dispatcher/dashboard.js", "renderDispatcherDashboard");
        } else if (active?.id === "dispatcher-reports") {
            _invokeRender("../dispatcher/reports.js", "renderDispatcherReports");
        }
    }
    if (itemKey === "drivers" && user.role === "company-admin") {
        const active = document.querySelector(".content-section:not(.hidden)");
        if (active?.id === "company-admin-drivers") {
            _invokeRender("../admin/company-admin-drivers.js", "renderCompanyAdminDrivers");
        } else if (active?.id === "company-admin-dashboard") {
            _invokeRender("../admin/company-admin.js", "renderCompanyAdminDashboard");
        }
    }
}

function _applyRemoteDocs(item, docs, companyId) {
    const updatedList = item.key === "drivers"
        ? _docsToDriversList(docs, companyId)
        : _docsToList(docs, companyId);
    if (JSON.stringify(window.state[item.key]) === JSON.stringify(updatedList)) return;
    window.state[item.key] = updatedList;
    _markBaselineFromList(item.key, updatedList);
    _handleRemoteCollectionUpdate(item.key);
    localStorage.setItem(getStateStorageKey(companyId), JSON.stringify(window.state));
}

function _startDispatcherAccessSync(companyRef, companyId) {
    const uid = _staffUid();
    if (!uid) return;
    const profileRef = companyRef.collection("users").doc(uid);
    const unsubscribeProfile = profileRef.onSnapshot(async (profileSnap) => {
        _dispatcherGroupListeners.forEach(unsubscribe => unsubscribe());
        _dispatcherGroupListeners = [];
        const profile = profileSnap.exists ? profileSnap.data() : null;
        const assignedIds = resolveDispatcherGroupIds({
            profileExists: profileSnap.exists,
            profileGroups: profile?.groups,
            claimGroups: window.currentUser?.groups
        });
        window.currentUser.groups = assignedIds;
        window.currentUser.activeGroupId = assignedIds.includes(window.currentUser.activeGroupId)
            ? window.currentUser.activeGroupId
            : (assignedIds[0] || null);
        window.state.dispatchers = profile ? [{ ...profile, id: uid, companyId, groups: assignedIds }] : [];
        window.state.groups = [];
        assignedIds.forEach(groupId => {
            const unsubscribe = companyRef.collection("groups").doc(groupId).onSnapshot(groupSnap => {
                window.state.groups = window.state.groups.filter(group => group.id !== groupId);
                if (groupSnap.exists) {
                    window.state.groups.push({ ...groupSnap.data(), id: groupSnap.id, companyId });
                }
                _markBaselineFromList("groups", window.state.groups);
                localStorage.setItem(getStateStorageKey(companyId), JSON.stringify(window.state));
                _handleRemoteCollectionUpdate("groups");
            });
            _dispatcherGroupListeners.push(unsubscribe);
        });
        persistDispatcherAccess(companyId);
    });
    _firestoreListeners.push(unsubscribeProfile);
}

function persistDispatcherAccess(companyId) {
    localStorage.setItem(getStateStorageKey(companyId), JSON.stringify(window.state));
}

function startFirestoreSync(companyId) {
    if (_firestoreListeners.length > 0) return;
    if (!companyId) return;

    const companyRef = db.collection("companies").doc(companyId);
    if (_isDispatcherSession()) _startDispatcherAccessSync(companyRef, companyId);

    const sosListener = companyRef.collection("settings").doc("sos").onSnapshot((snap) => {
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
            checkSOSStatus();
            if (window.state.sosActive && window.currentUser.role === "dispatcher") {
                showToast(t("sos_alarm_received"), "error", 8000);
            }
        }
    }, (error) => {
        // Permission denied when SOS belongs to another Dispo group — clear local alarm UI.
        window.state.sosActive = false;
        window.state.sosDriver = "";
        window.state.sosBus = "";
        _lastSosSnapshot = { sosActive: false, sosDriver: "", sosBus: "" };
        console.warn(`Firebase SOS listener denied | code=${error?.code || "unknown"}`);
    });
    _firestoreListeners.push(sosListener);

    GRANULAR_COLLECTIONS.forEach(item => {
        if (_isDispatcherSession() && (item.key === "groups" || item.key === "dispatchers")) return;
        if (!isGranularCollectionAllowed(_currentRole(), item.key)) return;
        if (_isDriverSession() && item.key === "drivers") {
            _firestoreListeners.push(companyRef.collection("drivers").doc(_driverUid()).onSnapshot((snap) => {
                _applyRemoteDocs(item, snap.exists ? [snap] : [], companyId);
            }));
            return;
        }
        if (_isDriverSession() && item.key === "messages") {
            const queryDocs = { private: [], broadcast: [] };
            const refresh = () => {
                const unique = new Map();
                [...queryDocs.private, ...queryDocs.broadcast].forEach(doc => unique.set(doc.id, doc));
                _applyRemoteDocs(item, [...unique.values()], companyId);
            };
            const messages = companyRef.collection("messages");
            _firestoreListeners.push(messages.where("recipientDriverId", "==", _driverUid()).onSnapshot((snap) => {
                if (!snap.metadata.hasPendingWrites) { queryDocs.private = snap.docs; refresh(); }
            }));
            _firestoreListeners.push(messages.where("broadcast", "==", true).onSnapshot((snap) => {
                if (!snap.metadata.hasPendingWrites) { queryDocs.broadcast = snap.docs; refresh(); }
            }));
            return;
        }
        if (_isDriverSession() && (item.key === "shifts" || item.key === "schedules")) {
            const listener = companyRef.collection(item.col)
                .where("driverId", "==", _driverUid())
                .onSnapshot((snap) => {
                    if (!snap.metadata.hasPendingWrites) _applyRemoteDocs(item, snap.docs, companyId);
                });
            _firestoreListeners.push(listener);
            return;
        }
        if (_isDriverSession() && (item.key === "reports" || item.key === "vacations" || item.key === "lostItems")) {
            const listener = companyRef.collection(item.col)
                .where("driverId", "==", _driverUid())
                .onSnapshot((snap) => {
                    if (!snap.metadata.hasPendingWrites) _applyRemoteDocs(item, snap.docs, companyId);
                });
            _firestoreListeners.push(listener);
            return;
        }
        if (_isDriverSession() && (item.key === "buses" || item.key === "routes")) {
            const homeGroupId = String(window.currentUser?.groupId || window.currentUser?.lineId || "").trim();
            if (!homeGroupId) {
                _applyRemoteDocs(item, [], companyId);
                return;
            }
            const listener = companyRef.collection(item.col)
                .where("groupId", "==", homeGroupId)
                .onSnapshot((snap) => {
                    if (!snap.metadata.hasPendingWrites) _applyRemoteDocs(item, snap.docs, companyId);
                });
            _firestoreListeners.push(listener);
            return;
        }
        if (_isDispatcherSession() && DISPATCHER_GROUP_SCOPED_KEYS.has(item.key)) {
            const queryDocs = new Map();
            const refresh = () => {
                const unique = new Map();
                [...queryDocs.values()].flat().forEach(doc => unique.set(doc.id, doc));
                _applyRemoteDocs(item, [...unique.values()], companyId);
            };
            const assignedIds = _dispatcherAssignedGroupIds();
            // Home groupId only — never knownGroupIds directory expansion.
            assignedIds.forEach((groupId) => {
                const primaryListener = companyRef.collection(item.col).where("groupId", "==", groupId).onSnapshot((snap) => {
                    if (snap.metadata.hasPendingWrites) return;
                    queryDocs.set(`g:${groupId}`, snap.docs);
                    refresh();
                });
                _firestoreListeners.push(primaryListener);
            });
            return;
        }
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
    _dispatcherGroupListeners.forEach(unsubscribe => unsubscribe());
    _dispatcherGroupListeners = [];
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

    if (status === "loading") {
        indicator.remove();
        return;
    }
    const statusText = status === "online"
        ? (window.t?.("firebase_ready") || "Firebase ready")
        : (window.t?.("firebase_load_error") || "Cloud data unavailable");
    indicator.innerHTML = status === "online"
        ? `<span style="width:8px;height:8px;border-radius:50%;background:#10b981;
               box-shadow:0 0 6px rgba(16,185,129,0.8);display:inline-block;"></span>
           <span style="color:rgba(255,255,255,0.7);">${statusText}</span>`
        : `<span style="width:8px;height:8px;border-radius:50%;background:#f59e0b;
               box-shadow:0 0 6px rgba(245,158,11,0.8);display:inline-block;"></span>
           <span style="color:rgba(255,255,255,0.7);">${statusText}</span>`;
}

async function initFirebase(companyId) {
    if (USE_LOCAL_STATE) return window.state;
    if (!companyId || companyId === EXPECTED_FIREBASE_PROJECT_ID) {
        throw new Error("Confirmed tenant companyId is required before Firestore initialization.");
    }
    // Drop caches for other tenants so stale branding / license IDs cannot leak across logins.
    clearAllTenantStateCaches({ keepCompanyId: companyId });
    initializeFirebaseClient();
    _firebaseReady = false;

    try {
        const cloudState = await loadStateFromFirestore(companyId);

        if (cloudState) {
            window.state = { ..._baseState(), ...cloudState };
            applyUiLanguagePreference();
            _resetSyncBaselines(window.state);
        } else if (_isDispatcherSession()) {
            window.state = { ..._baseState() };
            applyUiLanguagePreference();
            _resetSyncBaselines(window.state);
            showFirebaseStatus("offline");
            return window.state;
        } else {
            const localKey   = getStateStorageKey(companyId);
            const localSaved = localStorage.getItem(localKey);
            if (localSaved) {
                try { window.state = { ..._baseState(), ...JSON.parse(localSaved) }; }
                catch { window.state = { ..._baseState() }; }
            } else {
                window.state = { ..._baseState() };
            }
            applyUiLanguagePreference();
            _resetSyncBaselines(window.state);
            await saveStateToFirestore(window.state, companyId);
        }

        _firebaseReady = true;
        startFirestoreSync(companyId);

    } catch (err) {
        console.error("❌ Firebase init error:", err);
        if (_isDispatcherSession()) {
            window.state = { ..._baseState() };
            applyUiLanguagePreference();
            _resetSyncBaselines(window.state);
            showFirebaseStatus("error");
            throw err;
        }
        const localKey = getStateStorageKey(companyId);
        const localSaved = localStorage.getItem(localKey);
        if (localSaved) {
            try { window.state = { ..._baseState(), ...JSON.parse(localSaved) }; }
            catch { window.state = { ..._baseState() }; }
        } else {
            window.state = { ..._baseState() };
        }
        applyUiLanguagePreference();
        _resetSyncBaselines(window.state);
        showFirebaseStatus("error");
    }

    return window.state;
}

export {
    initializeFirebaseClient,
    isFirebaseReady,
    loadStateFromFirestore,
    saveStateToFirestore,
    acknowledgeServerCreatedIds,
    logClientAuditEvent,
    startFirestoreSync,
    stopFirestoreSync,
    showFirebaseStatus,
    initFirebase
};
