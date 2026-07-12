// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { getGroupById } from "../data/groups.js";
import { renderDispatcherDashboard } from "./dashboard.js";
import { renderDispatcherMessagesPage } from "./sent-messages.js";
import { t, translateUI } from "../ui/i18n.js";

export const MSG_TEMPLATES = [
    { cat: "tmpl_cat_delay",  items: ["tmpl_delay_5","tmpl_delay_10","tmpl_delay_15","tmpl_delay_20","tmpl_delay_30"] },
    { cat: "tmpl_cat_route",  items: ["tmpl_detour","tmpl_skip_stop","tmpl_route_end","tmpl_route_change"] },
    { cat: "tmpl_cat_ops",    items: ["tmpl_bus_full","tmpl_slow_down","tmpl_pax_check","tmpl_pax_incident","tmpl_police"] },
    { cat: "tmpl_cat_driver", items: ["tmpl_shift_now","tmpl_take_break","tmpl_end_shift","tmpl_call_dispatch","tmpl_help_coming"] }
];

function populateTemplateSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    MSG_TEMPLATES.forEach(group => {
        const optgrp = document.createElement("optgroup");
        optgrp.label = t(group.cat) || group.cat;
        group.items.forEach(key => {
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = t(key) || key;
            optgrp.appendChild(opt);
        });
        sel.appendChild(optgrp);
    });
}

// Helper — tekst poruke za prikaz (template + detalj), na datom jeziku
function msgText(msg, lang) {
    const dict = lang ? (window.TRANSLATIONS[lang] || window.TRANSLATIONS.en) : null;
    const translated = dict ? (dict[msg.template] || window.TRANSLATIONS.en[msg.template]) : t(msg.template);
    const base = translated || msg.text || msg.template || "";
    return msg.detail ? `${base} — ${msg.detail}` : base;
}

// Pratimo koji scope je aktivan po formi
const _msgScope = {};
let _messagesPageTab = "personal";

function _isGroupMessage(m) {
    return m.scope === "group";
}

function getMessagesFormScope() {
    return _messagesPageTab === "group" ? "group" : "driver";
}

function setMessagesPageTab(tab) {
    _messagesPageTab = tab === "group" ? "group" : "personal";
    _msgScope["dispatcher-message-form-messages"] = getMessagesFormScope();

    const personalBtn = document.getElementById("msg-tab-personal-btn");
    const groupBtn = document.getElementById("msg-tab-group-btn");
    if (personalBtn) personalBtn.classList.toggle("msg-scope-active", _messagesPageTab === "personal");
    if (groupBtn) groupBtn.classList.toggle("msg-scope-active", _messagesPageTab === "group");

    const composeTitle = document.getElementById("msg-compose-title");
    const historyTitle = document.getElementById("msg-history-title");
    if (composeTitle) {
        composeTitle.setAttribute(
            "data-i18n",
            _messagesPageTab === "group" ? "send_group_message_title" : "send_personal_message_title"
        );
        composeTitle.textContent = t(composeTitle.getAttribute("data-i18n")) || composeTitle.textContent;
    }
    if (historyTitle) {
        historyTitle.setAttribute(
            "data-i18n",
            _messagesPageTab === "group" ? "msg_history_group" : "msg_history_personal"
        );
        historyTitle.textContent = t(historyTitle.getAttribute("data-i18n")) || historyTitle.textContent;
    }

    populateMessageRecipients("dispatcher-message-form-messages");
    renderAllMessagesList();
    translateUI();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function populateMessageRecipients(formId) {
    const suf    = formId === "dispatcher-message-form" ? "" : "-messages";
    const select = document.getElementById("message-recipient" + suf);
    if (!select) return;

    const scope = formId === "dispatcher-message-form-messages"
        ? getMessagesFormScope()
        : (_msgScope[formId] || "driver");
    _msgScope[formId] = scope;
    const current = select.value;

    select.innerHTML = `<option value="__all__">📢 ${t("msg_all_drivers") || "Svi vozači"}</option>`;

    if (scope === "group") {
        (window.state.groups || []).forEach(g => {
            const cnt = (window.state.drivers || []).filter(d => d.groupId === g.id).length;
            const opt = document.createElement("option");
            opt.value = `group:${g.id}`;
            opt.innerText = `📣 ${escapeHtml(g.name)} (${cnt})`;
            select.appendChild(opt);
        });
    } else {
        (window.state.drivers || []).forEach(d => {
            const grp = getGroupById(d.groupId);
            const opt = document.createElement("option");
            opt.value = d.name;
            opt.innerText = grp ? `👤 ${d.name}  [${grp.name}]` : `👤 ${d.name}`;
            select.appendChild(opt);
        });
    }

    if (current) select.value = current;
}

function renderAllMessagesList() {
    renderDispatcherMessagesPage(_messagesPageTab);
}

function setMessageScope(scope, formId) {
    _msgScope[formId] = scope;

    const suf = formId === "dispatcher-message-form" ? "" : "-messages";
    const driverBtn = document.getElementById("msg-scope-driver-btn" + (suf ? "-m" : ""));
    const groupBtn  = document.getElementById("msg-scope-group-btn"  + (suf ? "-m" : ""));
    const select    = document.getElementById("message-recipient" + suf);
    const label     = select ? select.previousElementSibling : null;

    if (driverBtn) driverBtn.classList.toggle("msg-scope-active", scope === "driver");
    if (groupBtn)  groupBtn.classList.toggle("msg-scope-active",  scope === "group");

    if (!select) return;

    if (scope === "group") {
        if (label) label.setAttribute("data-i18n", "msg_scope_group_label");
        select.innerHTML = `<option value="__all__">${t("msg_all_drivers") || "Svi vozači"}</option>` +
            (window.state.groups || []).map(g =>
                `<option value="group:${g.id}">${escapeHtml(g.name)}</option>`
            ).join("");
    } else {
        if (label) label.setAttribute("data-i18n", "recipient_label");
        select.innerHTML = `<option value="__all__">${t("msg_all_drivers") || "Svi vozači"}</option>` +
            (window.state.drivers || []).map(d =>
                `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`
            ).join("");
    }
    translateUI();
}

// Ikone za tip poruke u istoriji
function msgTypeIcon(type) {
    switch (type) {
        case "warning":  return "⚠️";
        case "urgent":   return "🚨";
        case "schedule": return "📅";
        case "detour":   return "🔀";
        default:         return "ℹ️";
    }
}

function submitDispatcherMessage(event) {
    event.preventDefault();
    const formId  = event.target.id;
    const suf     = formId === "dispatcher-message-form" ? "" : "-messages";
    const scope = formId === "dispatcher-message-form-messages"
        ? getMessagesFormScope()
        : (_msgScope[formId] || "driver");

    const recipientEl = document.getElementById("message-recipient" + suf);
    const templateEl  = document.getElementById("message-template" + suf);
    const detailEl    = document.getElementById("message-detail"   + suf);

    const recipient = recipientEl ? recipientEl.value   : "__all__";
    const template  = templateEl  ? templateEl.value    : "";
    const detail    = detailEl    ? detailEl.value.trim() : "";

    if (!template) return;

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;
    const dateString = now.toISOString().slice(0, 10);

    // Ako je group scope i izabrana konkretna grupa, šaljemo svim vozačima u grupi
    let recipients = [];
    if (scope === "group" && recipient.startsWith("group:")) {
        const gid = recipient.replace("group:", "");
        const grp = (window.state.groups || []).find(g => g.id === gid);
        const groupDrivers = (window.state.drivers || []).filter(d => d.groupId === gid);
        recipients = groupDrivers.length > 0
            ? groupDrivers.map(d => d.name)
            : [grp ? grp.name : t("msg_all_drivers") || "Svi vozači"];
    } else if (recipient === "__all__") {
        recipients = [t("msg_all_drivers") || "Svi vozači"];
    } else {
        recipients = [recipient];
    }

    const senderName = window.currentUser ? window.currentUser.name : (t("dispatcher") || "Dispečer");

    recipients.forEach(rec => {
        const newMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
            date: dateString,
            time: timeString,
            sender: senderName,
            senderLang: window.state.language || "en",
            recipient: rec,
            template: template,   // translation ključ npr. "tmpl_delay_15"
            detail: detail,       // opcioni slobodni tekst (stanica, br. busa...)
            text: t(template) + (detail ? ` — ${detail}` : ""), // fallback za stari kod
            type: template.startsWith("tmpl_delay") ? "warning" :
                  template === "tmpl_call_dispatch" || template === "tmpl_pax_incident" ? "urgent" :
                  template.startsWith("tmpl_detour") || template.startsWith("tmpl_route") ? "detour" : "info",
            scope: scope,
            read: false
        };
        if (!window.state.messages) window.state.messages = [];
        window.state.messages.unshift(newMessage);
    });

    saveState();
    // Samo resetuj detalj polje, ne template select (dynamic options bi se izgubile s event.target.reset())
    if (detailEl) detailEl.value = "";
    if (formId === "dispatcher-message-form-messages") {
        setMessagesPageTab(_messagesPageTab);
    } else {
        setMessageScope("driver", formId);
    }
    populateTemplateSelect("message-template" + suf);

    showToast(t("js_alert_msg_sent") || "✅ Message sent!", "success", 3000);
    renderDispatcherDashboard();
    renderAllMessagesList();
}
export {
    populateTemplateSelect,
    msgText,
    populateMessageRecipients,
    renderAllMessagesList,
    setMessageScope,
    setMessagesPageTab,
    msgTypeIcon,
    submitDispatcherMessage
};
