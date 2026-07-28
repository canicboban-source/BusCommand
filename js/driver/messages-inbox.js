// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, formatDateTime, showToast } from "../core/utils.js";
import { msgText } from "../core/message-text.js";
import { playNotificationSound, renderDriverMessageArchive, showFullscreenMessageAlert } from "./message-alerts.js";
import { t } from "../ui/i18n.js";
import { speakMessage } from "../ui/speak.js";
import { actionAttr, changeAttr as _changeAttr } from "../core/action-delegate.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";

function isBroadcastRecipient(r) {
    return r === "__all__" || r === "Svi" || r === "Svi vozači" || r === "All drivers" || r === "all";
}

function isMessageForMe(m) {
    if (!m || !window.currentUser) return false;
    return m.recipientDriverId === window.currentUser.id
        || m.broadcast === true
        || m.recipient === window.currentUser.name
        || isBroadcastRecipient(m.recipient);
}

function isMessageReadByMe(m) {
    if (!m || !window.currentUser) return true;
    const name = window.currentUser.name;
    const uid = window.currentUser.id || window.currentUser.uid;
    if (Array.isArray(m.readBy)) return m.readBy.includes(name) || (uid && m.readBy.includes(uid));
    // Legacy personal messages used a shared `read` flag
    if (!isBroadcastRecipient(m.recipient)) return !!m.read;
    // Legacy broadcasts with shared read — treat as unread until per-driver readBy exists
    return false;
}

function isMessageArchivedByMe(m) {
    const uid = window.currentUser?.id || window.currentUser?.uid;
    return Boolean(m && (m.archivedBy?.includes(window.currentUser?.name)
        || (uid && m.archivedByIds?.includes(uid))));
}

function isDriverAppReady() {
    if (!window.currentUser || window.currentUser.role !== "driver") return false;
    const login = document.getElementById("login-screen");
    if (login && !login.classList.contains("hidden")) return false;
    const app = document.getElementById("app-container");
    if (!app || app.classList.contains("hidden")) return false;
    const pretrip = document.getElementById("pre-trip-modal");
    if (pretrip && !pretrip.classList.contains("hidden")) return false;
    return true;
}

function renderDriverMessages() {
    const container = document.getElementById("driver-messages-list-container");
    const badge = document.getElementById("unread-message-badge");

    if (!container) return;
    if (!window.currentUser || window.currentUser.role !== "driver") return;

    container.innerHTML = "";

    // Osveži arhiv sekciju svaki put
    renderDriverMessageArchive();

    const myMessages = (window.state.messages || []).filter(isMessageForMe).filter(m => !isMessageArchivedByMe(m));
    const unreadMessages = myMessages.filter(m => !isMessageReadByMe(m));
    const unreadCount = unreadMessages.length;
    
    if (badge) {
        if (unreadCount > 0) {
            badge.classList.remove("hidden");
            const modal = document.getElementById("msg-fullscreen-alert");
            // Fullscreen alert only after login + pre-trip + app shell — never over login
            if (isDriverAppReady() && modal && modal.classList.contains("hidden")) {
                showFullscreenMessageAlert(unreadMessages[0], unreadCount);
            }
        } else {
            badge.classList.add("hidden");
            const modal = document.getElementById("msg-fullscreen-alert");
            if (modal) {
                modal.classList.add("hidden");
            }
        }
    }

    // Do not speak/alert while still on login or pre-trip
    if (!isDriverAppReady()) {
        if (myMessages.length === 0) {
            container.innerHTML = `<div class="no-messages-text">${t("no_messages")}</div>`;
        }
        return;
    }
    
    // Pročitaj nepročitane poruke glasom (TTS)
    let spoken = [];
    try {
        const savedSpoken = sessionStorage.getItem("buscommand_spoken_messages");
        if (savedSpoken) spoken = JSON.parse(savedSpoken);
    } catch {}
    
    unreadMessages.forEach(msg => {
        if (!spoken.includes(msg.id)) {
            playNotificationSound();
            speakMessage(msgText(msg, window.state.language), window.state.language);
            spoken.push(msg.id);
        }
    });
    sessionStorage.setItem("buscommand_spoken_messages", JSON.stringify(spoken));
    
    if (myMessages.length === 0) {
        container.innerHTML = `<div class="no-messages-text">${t("no_messages")}</div>`;
        return;
    }
    
    myMessages.forEach(msg => {
        const div = document.createElement("div");
        const read = isMessageReadByMe(msg);
        div.className = `message-item ${read ? "msg-read" : "msg-unread"}`;
        
        let messageAction = "";
        if (!read) {
            messageAction = `<button class="btn-mark-read" ${actionAttr("markMessageAsRead", [msg.id])}><i data-lucide="check"></i> ${t("btn_mark_read")}</button>`;
        } else {
            messageAction = `<button class="btn-mark-read" ${actionAttr("archiveMessage", [msg.id])}><i data-lucide="archive"></i> ${t("archive_label")}</button>`;
        }
        
        div.innerHTML = `
            <div class="message-item-header">
                <span class="message-sender"><i data-lucide="shield" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i>${t("msg_from_dispatcher")}</span>
                <span class="message-time">${escapeHtml(formatDateTime(msg.date, msg.time))}</span>
            </div>
            <div class="message-text">${escapeHtml(msgText(msg, window.state.language))}</div>
            ${messageAction}
        `;
        container.appendChild(div);
    });
}

async function markMessageAsRead(id) {
    const msg = (window.state.messages || []).find(m => m.id === id);
    if (!msg || !isMessageForMe(msg)) return;

    if (!IS_DEMO_MODE) {
        const result = await ApiClient.markDriverMessageRead(id);
        if (!result?.success) {
            showToast(result?.error || t("msg_mark_read_failed") || "Poruka nije označena kao pročitana.", "error");
            return;
        }
    }

    if (!Array.isArray(msg.readBy)) msg.readBy = [];
    const name = window.currentUser.name;
    if (!msg.readBy.includes(name)) msg.readBy.push(name);

    // Keep legacy flag only for personal (non-broadcast) messages
    if (!isBroadcastRecipient(msg.recipient)) {
        msg.read = true;
    }

    if (IS_DEMO_MODE) saveState();
    renderDriverMessages();
    lucide.createIcons();
}
export {
    renderDriverMessages,
    markMessageAsRead,
    isBroadcastRecipient,
    isMessageForMe,
    isMessageReadByMe
};
