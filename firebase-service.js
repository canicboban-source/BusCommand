// ============================================================
// FleetPulse — FIREBASE CONFIGURATION
// Projekat: transitflow-prod (europe-west3 / Frankfurt)
// ============================================================

// Firebase compat SDK — radi direktno u browseru bez build tools
const firebaseConfig = {
    apiKey:            "AIzaSyBHW2NyhdXhg48tuzOhUsDJns4m2a6obQE",
    authDomain:        "transitflow-prod.firebaseapp.com",
    projectId:         "transitflow-prod",
    storageBucket:     "transitflow-prod.firebasestorage.app",
    messagingSenderId: "902580554748",
    appId:             "1:902580554748:web:f122ad5654e0c3ff16c079",
    measurementId:     "G-XZ7W37K4SM"
};

// Inicijalizacija
firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();

// ─── GLOBALNI LISTENERI ───────────────────────────────────────
let _firestoreListeners = [];
let _firebaseReady     = false;

// Pomoćna lista kolekcija za granularni sinhronizaciju
const GRANULAR_COLLECTIONS = [
    { key: "dispatchers", col: "users" },
    { key: "drivers",   col: "drivers" },
    { key: "shifts",    col: "shifts" },
    { key: "messages",  col: "messages" },
    { key: "buses",     col: "buses" },
    { key: "routes",    col: "routes" },
    { key: "reports",   col: "reports" },
    { key: "vacations", col: "vacations" },
    { key: "lostItems", col: "lost_items" },
    { key: "schedules", col: "schedules" }
];

// ============================================================
// LOAD STATE — čita iz granularnih Firestore kolekcija
// ============================================================
async function loadStateFromFirestore(companyId) {
    if (!companyId) return null;
    try {
        const companyRef = db.collection("companies").doc(companyId);
        
        // 1. Učitaj profile, branding i settings
        const profileSnap = await companyRef.collection("profile").doc("main").get();
        const brandingSnap = await companyRef.collection("branding").doc("main").get();
        const settingsSnap = await companyRef.collection("settings").doc("main").get();

        const loadedState = {
            branding: brandingSnap.exists ? brandingSnap.data() : {},
            settings: settingsSnap.exists ? settingsSnap.data() : {},
            profile: profileSnap.exists ? profileSnap.data() : {}
        };

        // 2. Učitaj sve granularne kolekcije
        for (const item of GRANULAR_COLLECTIONS) {
            const colSnap = await companyRef.collection(item.col).get();
            loadedState[item.key] = colSnap.docs.map(doc => {
                const data = doc.data();
                // Osiguraj da dokument ima svoj ID postavljen u objektu
                if (!data.id) data.id = doc.id;
                return data;
            });
        }

        // 3. Učitaj SOS stanje
        const sosSnap = await companyRef.collection("settings").doc("sos").get();
        if (sosSnap.exists) {
            const sosData = sosSnap.data();
            loadedState.sosActive = sosData.sosActive || false;
            loadedState.sosDriver = sosData.sosDriver || "";
            loadedState.sosBus = sosData.sosBus || "";
        }

        console.log("✅ Firebase: Granular State loaded for", companyId);
        return loadedState;
    } catch (err) {
        console.warn("⚠️ Firebase: Firestore granular load failed:", err);
        return null;
    }
}

// ============================================================
// SAVE STATE TO FIRESTORE — Vrši sinhronizaciju i izmjene
// ============================================================
async function saveStateToFirestore(stateObj, companyId) {
    if (!companyId) return;

    const companyRef = db.collection("companies").doc(companyId);

    try {
        // 1. Sačuvaj branding, settings i profile
        if (stateObj.branding) {
            await companyRef.collection("branding").doc("main").set(stateObj.branding, { merge: true });
        }
        if (stateObj.settings) {
            await companyRef.collection("settings").doc("main").set(stateObj.settings, { merge: true });
        }
        if (stateObj.profile) {
            await companyRef.collection("profile").doc("main").set(stateObj.profile, { merge: true });
        }

        // Sačuvaj SOS stanje
        await companyRef.collection("settings").doc("sos").set({
            sosActive: stateObj.sosActive || false,
            sosDriver: stateObj.sosDriver || "",
            sosBus: stateObj.sosBus || ""
        }, { merge: true });

        // 2. Rekonstruiši i sinhronizuj granularne kolekcije
        for (const item of GRANULAR_COLLECTIONS) {
            const localList = stateObj[item.key] || [];
            const collectionRef = companyRef.collection(item.col);

            // Dobavi trenutne dokumente iz Firestore-a radi brisanja onih koji više nisu u lokalnom stanju
            const remoteSnap = await collectionRef.get();
            const remoteIds = remoteSnap.docs.map(d => d.id);
            const localIds = localList.map(l => String(l.id || l.number || ''));

            // Upiši/ažuriraj lokalne
            for (const docObj of localList) {
                const docId = String(docObj.id || docObj.number || '');
                if (!docId) continue;
                await collectionRef.doc(docId).set(docObj, { merge: true });
            }

            // Obriši uklonjene
            const toDelete = remoteIds.filter(id => !localIds.includes(id));
            for (const idToDelete of toDelete) {
                await collectionRef.doc(idToDelete).delete();
            }
        }

        console.log("✅ Firebase: State successfully synced to Firestore for", companyId);
    } catch (err) {
        console.warn("⚠️ Firebase: Sync error:", err);
    }
}

// ============================================================
// REAL-TIME SYNC — onSnapshot listeneri po kolekcijama
// ============================================================
function startFirestoreSync(companyId) {
    if (_firestoreListeners.length > 0) return;
    if (!companyId) return;

    const companyRef = db.collection("companies").doc(companyId);

    // 1. Listener za SOS stanje
    const sosListener = companyRef.collection("settings").doc("sos").onSnapshot((snap) => {
        if (!snap.exists) return;
        const data = snap.data();
        const sosChanged = state.sosActive !== data.sosActive;
        
        state.sosActive = data.sosActive || false;
        state.sosDriver = data.sosDriver || "";
        state.sosBus = data.sosBus || "";

        if (sosChanged && typeof currentUser !== "undefined" && currentUser) {
            checkSOSStatus();
            if (state.sosActive && currentUser.role === "dispatcher") {
                showToast("🚨 SOS ALARM primljen!", "error", 8000);
            }
        }
    });
    _firestoreListeners.push(sosListener);

    // 2. Listeneri za granularne kolekcije
    GRANULAR_COLLECTIONS.forEach(item => {
        const listener = companyRef.collection(item.col).onSnapshot((snap) => {
            if (snap.metadata.hasPendingWrites) return;

            const updatedList = snap.docs.map(doc => {
                const d = doc.data();
                if (!d.id) d.id = doc.id;
                return d;
            });

            const changed = JSON.stringify(state[item.key]) !== JSON.stringify(updatedList);
            if (!changed) return;

            console.log(`🔄 Firebase: Remote update for ${item.key}`);
            state[item.key] = updatedList;

            // Trigger-uj odgovarajući render u zavisnosti od uloge i sekcije
            if (typeof currentUser !== "undefined" && currentUser) {
                if (item.key === "messages" && currentUser.role === "driver") {
                    renderDriverMessages();
                }
                if (item.key === "shifts") {
                    if (currentUser.role === "dispatcher") {
                        const active = document.querySelector(".content-section:not(.hidden)");
                        if (active && active.id === "dispatcher-shifts") renderDispatcherShifts();
                    }
                    if (currentUser.role === "driver") renderDriverDashboard();
                }
                if (item.key === "drivers" && currentUser.role === "dispatcher") {
                    const active = document.querySelector(".content-section:not(.hidden)");
                    if (active && active.id === "dispatcher-dashboard") renderDispatcherDashboard();
                }
            }

            // Ažuriraj i lokalno
            localStorage.setItem("fleetpulse_state_" + companyId, JSON.stringify(state));
        });

        _firestoreListeners.push(listener);
    });

    console.log("✅ Firebase: Real-time granular sync active for", companyId);
    showFirebaseStatus("online");
}

function stopFirestoreSync() {
    _firestoreListeners.forEach(unsub => unsub());
    _firestoreListeners = [];
}

// ============================================================
// STATUS INDIKATOR
// ============================================================
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

// ============================================================
// INICIJALIZACIJA — poziva se iz app.js na DOMContentLoaded
// ============================================================
async function initFirebase(companyId) {
    _firebaseReady = false;
    showFirebaseStatus("offline");

    try {
        const cloudState = await loadStateFromFirestore(companyId);

        if (cloudState) {
            state = { ...DEFAULT_STATE, ...cloudState };
        } else {
            const localKey   = "fleetpulse_state_" + companyId;
            const localSaved = localStorage.getItem(localKey);
            if (localSaved) {
                try { state = { ...DEFAULT_STATE, ...JSON.parse(localSaved) }; }
                catch(e) { state = { ...DEFAULT_STATE }; }
            } else {
                state = { ...DEFAULT_STATE };
            }
            // Inicijalni upload na Firebase
            await saveStateToFirestore(state, companyId);
        }

        _firebaseReady = true;
        startFirestoreSync(companyId);

    } catch(err) {
        console.error("❌ Firebase init error:", err);
        const localSaved = localStorage.getItem("fleetpulse_state_" + companyId);
        if (localSaved) {
            try { state = { ...DEFAULT_STATE, ...JSON.parse(localSaved) }; }
            catch(e) { state = { ...DEFAULT_STATE }; }
        } else {
            state = { ...DEFAULT_STATE };
        }
        showFirebaseStatus("offline");
    }

    return state;
}
