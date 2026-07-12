// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { formatDateTime } from "../core/utils.js";
import { msgText } from "../dispatcher/msg-compose.js";
import { playNotificationSound, renderDriverMessageArchive, showFullscreenMessageAlert } from "./message-alerts.js";
import { t } from "../ui/i18n.js";
import { speakMessage } from "../ui/speak.js";
import { actionAttr, changeAttr as _changeAttr } from "../core/action-delegate.js";

function renderDriverMessages() {
    const container = document.getElementById("driver-messages-list-container");
    const badge = document.getElementById("unread-message-badge");

    if (!container) return;

    container.innerHTML = "";

    // Osveži arhiv sekciju svaki put
    renderDriverMessageArchive();

    const myMessages = window.state.messages.filter(m => m.recipient === window.currentUser.name || m.recipient === "Svi");
    const unreadMessages = myMessages.filter(m => !m.read);
    const unreadCount = unreadMessages.length;
    
    if (unreadCount > 0) {
        badge.classList.remove("hidden");
        const modal = document.getElementById("msg-fullscreen-alert");
        if (modal && modal.classList.contains("hidden")) {
            showFullscreenMessageAlert(unreadMessages[0], unreadCount);
        }
    } else {
        badge.classList.add("hidden");
        const modal = document.getElementById("msg-fullscreen-alert");
        if (modal) {
            modal.classList.add("hidden");
        }
    }
    
    // Pročitaj nepročitane poruke glasom (TTS)
    let spoken = [];
    try {
        const savedSpoken = sessionStorage.getItem("buscommand_spoken_messages");
        if (savedSpoken) spoken = JSON.parse(savedSpoken);
    } catch(_e) {}
    
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
        div.className = `message-item ${msg.read ? 'msg-read' : 'msg-unread'}`;
        
        let markReadBtn = "";
        if (!msg.read) {
            markReadBtn = `<button class="btn-mark-read" ${actionAttr("markMessageAsRead", [msg.id])}><i data-lucide="check"></i> ${t("btn_mark_read")}</button>`;
        }
        
        div.innerHTML = `
            <div class="message-item-header">
                <span class="message-sender"><i data-lucide="shield" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i>${t("msg_from_dispatcher")}</span>
                <span class="message-time">${formatDateTime(msg.date, msg.time)}</span>
            </div>
            <div class="message-text">${msgText(msg, window.state.language)}</div>
            ${markReadBtn}
        `;
        container.appendChild(div);
    });
}

function markMessageAsRead(id) {
    const msg = window.state.messages.find(m => m.id === id);
    if (msg) {
        msg.read = true;
        saveState();
        renderDriverMessages();
        lucide.createIcons();
    }
}
export {
    renderDriverMessages,
    markMessageAsRead
};
