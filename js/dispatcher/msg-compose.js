// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { getGroupById } from "../data/groups.js";
import { renderDispatcherDashboard } from "./dashboard.js";
import { renderDispatcherMessagesPage } from "./sent-messages.js";
import { t, translateUI } from "../ui/i18n.js";
import { msgText } from "../core/message-text.js";
import ApiClient from "../core/api-client.js";
import { acknowledgeServerCreatedIds } from "../core/firebase-service.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";

export { msgText };

export const MSG_TEMPLATES = [
    { cat: "tmpl_cat_delay",  items: ["tmpl_delay_5","tmpl_delay_10","tmpl_delay_15","tmpl_delay_20","tmpl_delay_30"] },
    { cat: "tmpl_cat_route",  items: ["tmpl_detour","tmpl_skip_stop","tmpl_route_end","tmpl_route_change"] },
    { cat: "tmpl_cat_ops",    items: ["tmpl_bus_full","tmpl_slow_down","tmpl_pax_check","tmpl_pax_incident","tmpl_police"] },
    { cat: "tmpl_cat_driver", items: ["tmpl_shift_now","tmpl_take_break","tmpl_end_shift","tmpl_call_dispatch","tmpl_help_coming"] }
];

let messageSubmitPending = false;

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

// Pratimo koji scope je aktivan po formi
const _msgScope = {};
let _messagesPageTab = "personal";

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
    const currentMulti = [...select.selectedOptions].map((opt) => opt.value);

    select.innerHTML = "";
    select.multiple = scope === "group";
    select.size = scope === "group" ? Math.min(6, Math.max(3, (window.state.groups || []).length || 3)) : 1;
    select.classList.toggle("msg-recipient-multi", scope === "group");

    if (scope !== "group") {
        const allOpt = document.createElement("option");
        allOpt.value = "__all__";
        allOpt.textContent = `${t("msg_all_drivers") || "Svi vozači"}`;
        select.appendChild(allOpt);
    }

    if (scope === "group") {
        (window.state.groups || []).forEach(g => {
            const cnt = (window.state.drivers || []).filter(d => d.groupId === g.id).length;
            const opt = document.createElement("option");
            opt.value = `group:${g.id}`;
            opt.textContent = `${g.name} (${cnt})`;
            select.appendChild(opt);
        });
        if (currentMulti.length) {
            [...select.options].forEach((opt) => {
                opt.selected = currentMulti.includes(opt.value);
            });
        }
    } else {
        (window.state.drivers || []).forEach(d => {
            const grp = getGroupById(d.groupId);
            const opt = document.createElement("option");
            opt.value = d.id ? `driver:${d.id}` : d.name;
            opt.textContent = grp ? `${d.name}  [${grp.name}]` : `${d.name}`;
            select.appendChild(opt);
        });
        if (current) select.value = current;
    }
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
                `<option value="${escapeHtml(d.id ? `driver:${d.id}` : d.name)}">${escapeHtml(d.name)}</option>`
            ).join("");
    }
    translateUI();
}

function msgTypeIcon(type) {
    switch (type) {
        case "warning":  return "⚠️";
        case "urgent":   return "🚨";
        case "schedule": return "📅";
        case "detour":   return "🔀";
        default:         return "ℹ️";
    }
}

function buildLocalDemoMessages({ scope, recipient, template, detail, requiresAck }) {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const dateString = now.toISOString().slice(0, 10);
    const senderName = window.currentUser ? window.currentUser.name : (t("dispatcher") || "Dispečer");
    let recipients = [];

    if (scope === "group" && recipient.startsWith("group:")) {
        const gid = recipient.replace("group:", "");
        const groupDrivers = (window.state.drivers || []).filter(d => d.groupId === gid);
        recipients = groupDrivers.map(d => d.name);
    } else if (recipient === "__all__") {
        recipients = [t("msg_all_drivers") || "Svi vozači"];
    } else if (recipient.startsWith("driver:")) {
        const driver = (window.state.drivers || []).find(d => d.id === recipient.slice(7));
        recipients = [driver?.name || recipient];
    } else {
        recipients = [recipient];
    }

    const type = template.startsWith("tmpl_delay") ? "warning"
        : template === "tmpl_call_dispatch" || template === "tmpl_pax_incident" ? "urgent"
        : template.startsWith("tmpl_detour") || template.startsWith("tmpl_route") ? "detour" : "info";
    const ack = requiresAck === true || type === "urgent";

    return recipients.map(rec => {
        const recipientDriver = (window.state.drivers || []).find(d => d.name === rec);
        const isBroadcast = recipient === "__all__";
        return {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            date: dateString,
            time: timeString,
            sender: senderName,
            senderLang: window.state.language || "en",
            recipient: rec,
            recipientDriverId: recipientDriver?.id || null,
            broadcast: isBroadcast,
            template,
            detail,
            text: t(template) + (detail ? ` — ${detail}` : ""),
            type,
            scope,
            read: false,
            status: "delivered",
            deliveryChannel: "in_app",
            requiresAck: ack,
            ackedAt: null,
            ackedBy: null
        };
    });
}

function buildStaffMessagePayload({ scope, recipient, recipients, template, detail, requiresAck }) {
    const base = {
        template,
        detail: detail || "",
        senderLang: window.state.language || "en",
        senderName: window.currentUser?.name || undefined,
        displayScope: scope === "group" ? "group" : "driver",
        requiresAck: requiresAck === true
    };
    if (scope === "group") {
        const groupValues = (Array.isArray(recipients) && recipients.length
            ? recipients
            : [recipient]).filter(Boolean);
        const groupIds = groupValues
            .filter((value) => String(value).startsWith("group:"))
            .map((value) => String(value).slice(6));
        if (!groupIds.length) return null;
        if (groupIds.length === 1) {
            return { ...base, mode: "group", groupId: groupIds[0] };
        }
        return { ...base, mode: "group", groupIds };
    }
    if (recipient === "__all__") {
        return { ...base, mode: "broadcast" };
    }
    if (recipient.startsWith("group:")) {
        return { ...base, mode: "group", groupId: recipient.slice(6) };
    }
    if (recipient.startsWith("driver:")) {
        return { ...base, mode: "driver", recipientDriverId: recipient.slice(7) };
    }
    const driver = (window.state.drivers || []).find(d => d.name === recipient);
    if (driver?.id) {
        return { ...base, mode: "driver", recipientDriverId: driver.id };
    }
    return null;
}

async function submitDispatcherMessage(event) {
    event.preventDefault();
    if (messageSubmitPending) return;

    const formId  = event.target.id;
    const suf     = formId === "dispatcher-message-form" ? "" : "-messages";
    const scope = formId === "dispatcher-message-form-messages"
        ? getMessagesFormScope()
        : (_msgScope[formId] || "driver");

    const recipientEl = document.getElementById("message-recipient" + suf);
    const templateEl  = document.getElementById("message-template" + suf);
    const detailEl    = document.getElementById("message-detail"   + suf);
    const ackEl       = document.getElementById("message-requires-ack" + suf);

    const selected = recipientEl
        ? [...recipientEl.selectedOptions].map((opt) => opt.value)
        : ["__all__"];
    const recipient = selected[0] || "__all__";
    const template  = templateEl  ? templateEl.value    : "";
    const detail    = detailEl    ? detailEl.value.trim() : "";
    const requiresAck = Boolean(ackEl?.checked);

    if (!template) return;
    if (scope === "group" && !selected.some((value) => String(value).startsWith("group:"))) {
        showToast(t("msg_select_group") || "Izaberite bar jednu grupu.", "error");
        return;
    }

    messageSubmitPending = true;
    try {
        let created = [];
        if (IS_DEMO_MODE) {
            created = buildLocalDemoMessages({ scope, recipient, template, detail, requiresAck });
            if (!window.state.messages) window.state.messages = [];
            created.forEach((message) => window.state.messages.unshift(message));
            saveState();
        } else {
            const payload = buildStaffMessagePayload({
                scope,
                recipient,
                recipients: selected,
                template,
                detail,
                requiresAck
            });
            if (!payload) {
                showToast(t("msg_send_failed") || "Poruka nije poslata.", "error");
                return;
            }
            const result = await ApiClient.sendStaffMessage(payload);
            if (!result.success) {
                showToast(result.error || t("msg_send_failed") || "Poruka nije poslata.", "error");
                return;
            }
            created = Array.isArray(result.messages) ? result.messages : [];
            if (!window.state.messages) window.state.messages = [];
            created.forEach((message) => window.state.messages.unshift(message));
            acknowledgeServerCreatedIds(
              "messages",
              created.map((message) => message?.id).filter(Boolean)
            );
        }

        if (detailEl) detailEl.value = "";
        if (ackEl) ackEl.checked = false;
        if (formId === "dispatcher-message-form-messages") {
            setMessagesPageTab(_messagesPageTab);
        } else {
            setMessageScope("driver", formId);
        }
        populateTemplateSelect("message-template" + suf);

        showToast(t("js_alert_msg_sent") || "✅ Message sent!", "success", 3000);
        renderDispatcherDashboard();
        renderAllMessagesList();
    } finally {
        messageSubmitPending = false;
    }
}

export {
    populateTemplateSelect,
    populateMessageRecipients,
    renderAllMessagesList,
    setMessageScope,
    setMessagesPageTab,
    msgTypeIcon,
    submitDispatcherMessage
};
