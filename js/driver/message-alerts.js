// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, formatDateTime, showToast } from "../core/utils.js";
import { msgText } from "../core/message-text.js";
import { markMessageAsRead, renderDriverMessages } from "./messages-inbox.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";

const archivePending = new Set();

function messageTargetsCurrentDriver(message) {
    const user = window.currentUser;
    if (!message || !user) return false;
    return message.broadcast === true
        || message.recipientDriverId === (user.id || user.uid)
        || message.recipient === user.name
        || ["Svi", "all", "__all__", "All drivers"].includes(message.recipient);
}

function isArchivedForCurrentDriver(message) {
    const user = window.currentUser;
    return Boolean(message && user && (
        message.archivedByIds?.includes(user.id || user.uid)
        || message.archivedBy?.includes(user.name)
    ));
}

// Reprodukcija zvuka obaveštenja pomoću Web Audio API-ja (ne zahteva preuzimanje audio fajlova)
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ton 1: C5 (523.25 Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.15);
        
        // Ton 2: E5 (659.25 Hz) započinje sa malim zakašnjenjem
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc2.start(audioCtx.currentTime + 0.12);
        osc2.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
        console.warn("Neuspelo pokretanje AudioContext:", e);
    }
}

// Prikazivanje full-screen panela za hitne/nove poruke dispečera
function showFullscreenMessageAlert(msg, totalCount) {
    if (!window.currentUser || window.currentUser.role !== "driver") return;
    const login = document.getElementById("login-screen");
    if (login && !login.classList.contains("hidden")) return;
    const app = document.getElementById("app-container");
    if (!app || app.classList.contains("hidden")) return;

    const modal = document.getElementById("msg-fullscreen-alert");
    const sender = document.getElementById("msg-alert-sender");
    const text = document.getElementById("msg-alert-text");
    const time = document.getElementById("msg-alert-time");
    const more = document.getElementById("msg-alert-more");

    if (!modal) return;

    modal.dataset.msgId = msg.id;
    modal.dataset.requiresAck = msg.requiresAck === true ? "1" : "0";
    if (sender) sender.textContent = msg.sender || "Dispe\u010der";
    if (text) text.textContent = msgText(msg, window.state.language);
    
    if (time) {
        time.textContent = formatDateTime(msg.date, msg.time);
    }

    const confirmBtn = modal.querySelector("[data-action=\"confirmMessageRead\"]");
    if (confirmBtn) {
        const label = msg.requiresAck === true
            ? (t("btn_ack_message") || "Potvrdi čitanje")
            : (t("btn_mark_read") || "Pročitano");
        confirmBtn.textContent = label;
    }

    if (more) {
        if (totalCount > 1) {
            let label = "+ " + (totalCount - 1) + " ";
            if (window.state.language === "de") {
                label += "weitere Nachrichten";
            } else if (window.state.language === "en") {
                label += "more messages";
            } else {
                label += "još poruka";
            }
            more.textContent = label;
            more.classList.remove("hidden");
        } else {
            more.classList.add("hidden");
        }
    }

    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Potvrda čitanja poruke sa full-screen ekrana
function confirmMessageRead() {
    const modal = document.getElementById("msg-fullscreen-alert");
    if (!modal) return;
    const msgId = modal.dataset.msgId;
    if (msgId) {
        markMessageAsRead(msgId);
    }
    modal.classList.add("hidden");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
}

// Arhiviraj jednu poruku (vozačka strana)
async function archiveMessage(id) {
    if (archivePending.has(id)) return;
    const msg = window.state.messages.find(m => m.id === id);
    if (!msg || !messageTargetsCurrentDriver(msg)) return;
    archivePending.add(id);
    try {
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.archiveDriverMessage(id);
            if (!result.success) {
                showToast(result.error || t("driver_message_archive_failed"), "error");
                return;
            }
            if (!Array.isArray(msg.archivedByIds)) msg.archivedByIds = [];
            const uid = window.currentUser.id || window.currentUser.uid;
            if (uid && !msg.archivedByIds.includes(uid)) msg.archivedByIds.push(uid);
        } else {
            if (!Array.isArray(msg.archivedBy)) msg.archivedBy = [];
            if (!msg.archivedBy.includes(window.currentUser.name)) msg.archivedBy.push(window.currentUser.name);
            saveState();
        }
        renderDriverMessages();
        renderDriverMessageArchive();
        if (typeof lucide !== "undefined") lucide.createIcons();
    } finally {
        archivePending.delete(id);
    }
}

// Arhiviraj sve pročitane poruke vozača odjednom
async function archiveReadMessages() {
    const myRead = (window.state.messages || []).filter(m =>
        messageTargetsCurrentDriver(m) && (m.read || m.readBy?.includes(window.currentUser.name)
            || m.readBy?.includes(window.currentUser.id || window.currentUser.uid))
        && !isArchivedForCurrentDriver(m)
    );
    if (myRead.length === 0) return;
    await Promise.all(myRead.map(msg => archiveMessage(msg.id)));
    showToast(t("messages_archived") || "Messages archived", "success");
}

// Prikaži arhiv poruka (sklopivi accordion ispod aktivnih poruka)
function renderDriverMessageArchive() {
    let archiveSection = document.getElementById("driver-messages-archive");
    if (!archiveSection) return; // HTML element mora postojati

    const archived = (window.state.messages || []).filter(m => messageTargetsCurrentDriver(m) && isArchivedForCurrentDriver(m));

    if (archived.length === 0) {
        archiveSection.innerHTML = "";
        return;
    }

    archiveSection.innerHTML = `
        <details style="margin-top:12px;">
            <summary style="cursor:pointer; font-size:0.78rem; color:var(--text-muted);
                padding:6px 10px; background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.06); border-radius:8px;
                display:flex; align-items:center; gap:6px; list-style:none; user-select:none;">
                📁 ${t("archive_label") || "Archive"} (${archived.length})
            </summary>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                ${archived.map(msg => `
                    <div style="background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.04);
                        border-radius:6px; padding:8px 10px; opacity:0.65;">
                        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted); margin-bottom:4px;">
                            <span>📨 ${t("msg_from_dispatcher") || "Dispatcher"}</span>
                            <span>${escapeHtml(formatDateTime(msg.date, msg.time))}</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(msgText(msg, window.state.language))}</div>
                    </div>
                `).join("")}
            </div>
        </details>
    `;
}
export {
    playNotificationSound,
    showFullscreenMessageAlert,
    confirmMessageRead,
    archiveMessage,
    archiveReadMessages,
    renderDriverMessageArchive
};
