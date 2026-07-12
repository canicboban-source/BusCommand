// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, formatDateTime, showToast } from "../core/utils.js";
import { msgText } from "../dispatcher/msg-compose.js";
import { markMessageAsRead, renderDriverMessages } from "./messages-inbox.js";
import { t } from "../ui/i18n.js";

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
    const modal = document.getElementById("msg-fullscreen-alert");
    const sender = document.getElementById("msg-alert-sender");
    const text = document.getElementById("msg-alert-text");
    const time = document.getElementById("msg-alert-time");
    const more = document.getElementById("msg-alert-more");

    if (!modal) return;

    modal.dataset.msgId = msg.id;
    if (sender) sender.textContent = msg.sender || "Dispečer";
    if (text) text.textContent = msgText(msg, window.state.language);
    
    if (time) {
        time.textContent = formatDateTime(msg.date, msg.time);
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
}

// Arhiviraj jednu poruku (vozačka strana)
function archiveMessage(id) {
    const msg = window.state.messages.find(m => m.id === id);
    if (!msg) return;
    if (!msg.archivedBy) msg.archivedBy = [];
    if (!msg.archivedBy.includes(window.currentUser.name)) {
        msg.archivedBy.push(window.currentUser.name);
    }
    saveState();
    renderDriverMessages();
    renderDriverMessageArchive();
    lucide.createIcons();
}

// Arhiviraj sve pročitane poruke vozača odjednom
function archiveReadMessages() {
    const myRead = window.state.messages.filter(m =>
        (m.recipient === window.currentUser.name || m.recipient === "Svi" || m.recipient === "all") &&
        m.read && !(m.archivedBy && m.archivedBy.includes(window.currentUser.name))
    );
    if (myRead.length === 0) return;
    myRead.forEach(msg => {
        if (!msg.archivedBy) msg.archivedBy = [];
        msg.archivedBy.push(window.currentUser.name);
    });
    saveState();
    renderDriverMessages();
    renderDriverMessageArchive();
    showToast(t("messages_archived") || "Messages archived", "success");
    lucide.createIcons();
}

// Prikaži arhiv poruka (sklopivi accordion ispod aktivnih poruka)
function renderDriverMessageArchive() {
    let archiveSection = document.getElementById("driver-messages-archive");
    if (!archiveSection) return; // HTML element mora postojati

    const archived = window.state.messages.filter(m =>
        (m.recipient === window.currentUser.name || m.recipient === "Svi" || m.recipient === "all") &&
        m.archivedBy && m.archivedBy.includes(window.currentUser.name)
    );

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
                            <span>${formatDateTime(msg.date, msg.time)}</span>
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
