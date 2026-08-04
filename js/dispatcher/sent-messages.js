// BusCommand ESM v9.5 — prikaz i arhiva dispečerskih poruka
import { escapeHtml, formatDateTime, showToast } from "../core/utils.js";
import { msgText } from "../core/message-text.js";
import { msgTypeIcon, renderAllMessagesList } from "./msg-compose.js";
import { t } from "../ui/i18n.js";
import {
    ACTIVE_MSG_LIMIT,
    ARCHIVE_MSG_LIMIT,
    archiveAllForDispatcherTab,
    archiveMessageForDispatcher,
    countArchivedForTab,
    getActiveMessagesForTab,
    getArchivedMessagesForTab,
    isDispArchived,
    isGroupScopeMessage
} from "./message-archive.js";
import { actionAttr } from "../core/action-delegate.js";

function archiveBtnHtml(msgId) {
    return `<button type="button" ${actionAttr("archiveDispatcherMessage", [msgId])} title="${t("archive_message") || "Arhiviraj"}"
        style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:var(--text-muted);
        border-radius:6px;padding:3px 8px;font-size:0.72rem;cursor:pointer;display:inline-flex;align-items:center;gap:4px;
        transition:all 0.15s;font-family:'Outfit',sans-serif;"
        onmouseover="this.style.borderColor='rgba(245,158,11,0.5)';this.style.color='#f59e0b'"
        onmouseout="this.style.borderColor='rgba(255,255,255,0.1)';this.style.color='var(--text-muted)'">
        <i data-lucide="archive" style="width:12px;height:12px;"></i> ${t("archive_message") || "Arhiviraj"}
    </button>`;
}

function messageDeliveryBadge(m) {
    if (m.requiresAck && !m.ackedAt) {
        return `<span class="msg-status-chip is-warning">${escapeHtml(t("msg_status_awaiting_ack") || "Čeka potvrdu čitanja")}</span>`;
    }
    if (m.status === "failed") {
        return `<span class="msg-status-chip is-critical">${escapeHtml(t("msg_status_failed") || "Neuspelo slanje")}</span>`;
    }
    if (m.ackedAt || m.status === "read" || (m.broadcast !== true && m.read === true)) {
        return `<span class="msg-status-chip is-ok">${escapeHtml(t("msg_status_read") || "Pročitano")}</span>`;
    }
    if (m.status === "queued" || m.status === "sent") {
        return `<span class="msg-status-chip is-pending">${escapeHtml(t("msg_status_pending") || "U redu za slanje")}</span>`;
    }
    return `<span class="msg-status-chip is-pending">${escapeHtml(t("msg_status_delivered") || "Isporučeno")}</span>`;
}

function messageCardHtml(m, { compact = false, showArchiveBtn = true } = {}) {
    const icon = msgTypeIcon(m.type);
    const typeLabel = t("msg_type_" + (m.type || "info")) || m.type || "Info";
    const awaiting = m.requiresAck ? !m.ackedAt : !(m.read || m.status === "read");
    const bgColor = m.type === "urgent" ? "rgba(239,68,68,0.08)" :
        m.type === "warning" ? "rgba(245,158,11,0.08)" :
        m.type === "schedule" ? "rgba(14,165,233,0.08)" :
        m.type === "detour" ? "rgba(139,92,246,0.08)" :
        "rgba(255,255,255,0.02)";
    const borderCol = m.type === "urgent" ? "rgba(239,68,68,0.3)" :
        m.type === "warning" ? "rgba(245,158,11,0.3)" :
        m.type === "schedule" ? "rgba(14,165,233,0.3)" :
        m.type === "detour" ? "rgba(139,92,246,0.3)" :
        "var(--panel-border)";
    const timeLabel = m.date ? formatDateTime(m.date, m.time) : (m.time || "");
    const opacity = compact ? "opacity:0.65;" : "";

    return `
    <div style="background:${bgColor};border:1px solid ${borderCol};border-radius:10px;padding:${compact ? "10px 12px" : "12px 14px"};margin-bottom:8px;${opacity}${awaiting && !compact ? "border-left:3px solid var(--primary-color);" : ""}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
            <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">${icon} ${typeLabel}</span>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                ${messageDeliveryBadge(m)}
                <span style="font-size:0.75rem;color:var(--text-muted);">${timeLabel}</span>
                ${showArchiveBtn ? archiveBtnHtml(m.id) : ""}
            </div>
        </div>
        <div style="font-size:0.88rem;color:var(--text-main);margin-bottom:4px;">${escapeHtml(msgText(m, window.state.language))}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
            <span>→ <strong>${escapeHtml(m.recipient)}</strong></span>
            <span>${t("sender") || "Od"}: ${escapeHtml(m.sender)}</span>
        </div>
    </div>`;
}

function renderArchiveAccordion(archiveEl, tab) {
    if (!archiveEl) return;
    const totalArchived = countArchivedForTab(tab);
    if (totalArchived === 0) {
        archiveEl.innerHTML = "";
        return;
    }
    const archived = getArchivedMessagesForTab(tab, ARCHIVE_MSG_LIMIT);
    const moreCount = totalArchived - archived.length;

    archiveEl.innerHTML = `
        <details style="margin-top:12px;">
            <summary style="cursor:pointer;font-size:0.8rem;color:var(--text-muted);
                padding:8px 12px;background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.08);border-radius:8px;
                display:flex;align-items:center;gap:8px;list-style:none;user-select:none;">
                <i data-lucide="archive" style="width:14px;height:14px;"></i>
                ${t("archive_label") || "Arhiva"} (${totalArchived})
            </summary>
            <p style="font-size:0.72rem;color:var(--text-muted);margin:8px 0 6px;" data-i18n="msg_archive_hint">Arhivirane poruke se ne prikazuju u aktivnoj listi, ali ostaju sačuvane.</p>
            <div style="max-height:320px;overflow-y:auto;padding-right:4px;">
                ${archived.map(m => messageCardHtml(m, { compact: true, showArchiveBtn: false })).join("")}
            </div>
            ${moreCount > 0 ? `<p style="font-size:0.72rem;color:var(--text-muted);margin-top:8px;text-align:center;">${(t("msg_archive_more") || "+ još {count} u arhivi").replace("{count}", String(moreCount))}</p>` : ""}
        </details>`;
}

/** Glavna stranica Poruke — lične / grupne */
function renderDispatcherMessagesPage(tab = "personal") {
    const container = document.getElementById("dispatcher-all-messages-list");
    const archiveEl = document.getElementById("dispatcher-messages-page-archive");
    const archiveAllBtn = document.getElementById("msg-archive-all-btn");
    if (!container) return;

    const msgs = getActiveMessagesForTab(tab, ACTIVE_MSG_LIMIT);
    const totalActive = (window.state.messages || []).filter(m => {
        const wantGroup = tab === "group";
        return !isDispArchived(m) && (wantGroup ? isGroupScopeMessage(m) : !isGroupScopeMessage(m));
    }).length;

    if (archiveAllBtn) {
        archiveAllBtn.style.display = msgs.length > 0 ? "inline-flex" : "none";
    }

    if (msgs.length === 0) {
        const emptyKey = tab === "group" ? "no_group_messages" : "no_personal_messages";
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:24px 0;">${t(emptyKey) || t("no_messages") || "Nema poruka."}</div>`;
    } else {
        let html = msgs.map(m => messageCardHtml(m)).join("");
        if (totalActive > ACTIVE_MSG_LIMIT) {
            const hint = (t("msg_list_trimmed") || "Prikazano {limit} najnovijih").replace("{limit}", String(ACTIVE_MSG_LIMIT));
            html += `<p style="font-size:0.75rem;color:var(--text-muted);text-align:center;margin-top:8px;">${hint}</p>`;
        }
        container.innerHTML = html;
    }

    renderArchiveAccordion(archiveEl, tab);
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function refreshDispatcherMessageViews() {
    renderDispatcherSentMessages();
    renderAllMessagesList();
    window.renderDispatcherDashboard?.();
}

function renderDispatcherSentMessages() {
    const container = document.getElementById("dispatcher-sent-messages-list");
    if (!container) return;

    const msgs = getActiveMessagesForTab("personal", 20);
    if (msgs.length === 0) {
        container.innerHTML = `<div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:10px;">${t("no_messages")}</div>`;
        renderDispatcherMessageArchive();
        return;
    }

    container.innerHTML = msgs.map(m => messageCardHtml(m, { compact: true })).join("");
    if (typeof lucide !== "undefined") lucide.createIcons();
    renderDispatcherMessageArchive();
}

function renderDispatcherMessageArchive() {
    renderArchiveAccordion(document.getElementById("dispatcher-messages-archive"), "personal");
}

async function archiveDispatcherMessage(id) {
    const ok = await archiveMessageForDispatcher(id);
    if (!ok) return;
    refreshDispatcherMessageViews();
    showToast(t("message_archived") || t("messages_archived") || "Poruka arhivirana", "success", 2000);
}

async function archiveAllDispatcherMessages(tab) {
    const resolvedTab = tab || (document.getElementById("msg-tab-group-btn")?.classList.contains("msg-scope-active") ? "group" : "personal");
    const count = await archiveAllForDispatcherTab(resolvedTab);
    if (count === 0) {
        showToast(t("no_messages") || "Nema poruka za arhivu", "info", 2000);
        return;
    }
    refreshDispatcherMessageViews();
    showToast(t("messages_archived") || "Poruke arhivirane", "success", 2500);
}

export {
    renderDispatcherMessagesPage,
    renderDispatcherSentMessages,
    renderDispatcherMessageArchive,
    archiveDispatcherMessage,
    archiveAllDispatcherMessages,
    refreshDispatcherMessageViews
};
