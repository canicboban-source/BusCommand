// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";

// --- WEB AUDIO API SOS SIRENA ---
let audioCtx = null;
let sirenOscillator = null;
let sirenGainNode = null;
let sirenInterval = null;
let sosResolvePending = false;

function startSOSSiren() {
    if (sirenInterval) return; // Već svira
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    } catch (e) {
        console.error("Web Audio API nije podržan na ovom pretraživaču", e);
        return;
    }
    
    sirenGainNode = audioCtx.createGain();
    sirenGainNode.gain.setValueAtTime(0.25, audioCtx.currentTime); // Umerena jačina zvuka
    sirenGainNode.connect(audioCtx.destination);
    
    sirenOscillator = audioCtx.createOscillator();
    sirenOscillator.type = 'sawtooth'; // Oštriji, piskavi ton alarma
    sirenOscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    sirenOscillator.connect(sirenGainNode);
    sirenOscillator.start();
    
    let stateToggle = false;
    sirenInterval = setInterval(() => {
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        // Naizmenično menjaj visinu tona za sirenu
        sirenOscillator.frequency.setValueAtTime(stateToggle ? 900 : 500, now);
        stateToggle = !stateToggle;
    }, 450);
}

function stopSOSSiren() {
    if (sirenInterval) {
        clearInterval(sirenInterval);
        sirenInterval = null;
    }
    if (sirenOscillator) {
        try {
            sirenOscillator.stop();
            sirenOscillator.disconnect();
        } catch {}
        sirenOscillator = null;
    }
    if (sirenGainNode) {
        sirenGainNode.disconnect();
        sirenGainNode = null;
    }
    if (audioCtx) {
        try {
            audioCtx.close();
        } catch {}
        audioCtx = null;
    }
}

function checkSOSStatus() {
    const dispBanner = document.getElementById("dispatcher-sos-banner");
    const driverBanner = document.getElementById("driver-sos-banner");

    if (window.state.sosActive) {
        if (window.currentUser && window.currentUser.role === "dispatcher") {
            if (dispBanner) {
                // Inline styles — zaobilazi svaki CSS specificity ili cache problem
                dispBanner.style.cssText = `
                    display: flex !important;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 16px 24px;
                    background-color: #b91c1c;
                    border-bottom: 3px solid #fca5a5;
                    animation: sosPulse 0.8s ease-in-out infinite, sosBorderPulse 0.8s ease-in-out infinite;
                    position: relative;
                    z-index: 9000;
                `;
                dispBanner.classList.remove("hidden");

                const infoEl = document.getElementById("dispatcher-sos-info");
                if (infoEl) {
                    infoEl.style.cssText = "display:block; color:#fff; font-size:0.92rem; font-weight:600; margin-top:4px;";
                    infoEl.innerText = `🚌 ${t("vehicle")} ${window.state.sosBus} — ${window.state.sosDriver}`;
                }

                const titleEl = dispBanner.querySelector("strong");
                if (titleEl) {
                    titleEl.style.cssText = "display:block; color:#fff; font-size:1.05rem; font-weight:900; letter-spacing:1px; text-transform:uppercase;";
                    titleEl.innerText = "⚠ " + t("sos_alert_title");
                }

                const btn = dispBanner.querySelector(".btn-sos-resolve");
                if (btn) {
                    btn.style.cssText = `
                        background: white;
                        color: #b91c1c;
                        border: none;
                        padding: 10px 22px;
                        border-radius: 10px;
                        font-size: 0.88rem;
                        font-weight: 800;
                        cursor: pointer;
                        white-space: nowrap;
                        font-family: 'Outfit', sans-serif;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        flex-shrink: 0;
                    `;
                    btn.disabled = sosResolvePending;
                }

                const icon = dispBanner.querySelector(".pulse-icon");
                if (icon) {
                    icon.style.cssText = "color:#fff; width:32px; height:32px; flex-shrink:0; animation: sosIconPulse 0.8s ease-in-out infinite;";
                }

                startSOSSiren();
            }
            if (driverBanner) driverBanner.classList.add("hidden");
        } else if (window.currentUser && window.currentUser.role === "driver" && window.currentUser.name === window.state.sosDriver) {
            if (driverBanner) driverBanner.classList.remove("hidden");
            if (dispBanner) dispBanner.style.display = "none";
        } else {
            if (dispBanner) dispBanner.style.display = "none";
            if (driverBanner) driverBanner.classList.add("hidden");
        }
    } else {
        if (dispBanner) {
            dispBanner.style.display = "none";
            dispBanner.classList.add("hidden");
        }
        if (driverBanner) driverBanner.classList.add("hidden");
        stopSOSSiren();
    }
}

function clearLocalSosState() {
    window.state.sosActive = false;
    window.state.sosDriver = "";
    window.state.sosBus = "";
    window.state.sosId = null;
}

/**
 * @param {string} [note] Optional dispatcher note. Empty is fine — the server records
 *   a default so the audit still has a reason. Clearing a live alarm must never be
 *   blocked by a form field.
 */
async function resolveSOS(note = "") {
    if (sosResolvePending) return false;
    if (window.currentUser?.role && window.currentUser.role !== "dispatcher" && !USE_LOCAL_STATE) {
        showToast(t("sos_resolve_denied") || "Samo disponent može rešiti SOS.", "error");
        return false;
    }
    if (!window.state.sosActive && !USE_LOCAL_STATE) {
        showToast(t("sos_not_active") || "Nema aktivnog SOS alarma.", "info");
        return false;
    }

    sosResolvePending = true;
    // Silence immediately on confirm; if the server rejects, checkSOSStatus() in the
    // finally block restarts the siren because sosActive is still true.
    stopSOSSiren();
    checkSOSStatus();
    try {
        if (!USE_LOCAL_STATE) {
            const result = await ApiClient.resolveStaffSos(note);
            if (!result.success) {
                showToast(result.error || t("sos_resolve_failed") || "SOS nije mogao biti rešen.", "error");
                return false;
            }
        }
        clearLocalSosState();
        if (USE_LOCAL_STATE) saveState();
        checkSOSStatus();
        showToast(t("js_alert_sos_resolved"), "success");
        return true;
    } finally {
        sosResolvePending = false;
        checkSOSStatus();
    }
}

export {
    startSOSSiren,
    stopSOSSiren,
    checkSOSStatus,
    resolveSOS
};
