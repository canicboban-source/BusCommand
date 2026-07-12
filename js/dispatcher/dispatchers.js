// BusCommand ESM v9.5
import { superadminResetPin } from "../admin/superadmin.js";
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { renderDispatcherSettings } from "./settings.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

function addDispatcher() {
    const nameInput  = document.getElementById("new-disp-name");
    const groupInput = document.getElementById("new-disp-group");
    const pinInput   = document.getElementById("new-disp-pin");

    if (!nameInput) return;

    const name    = nameInput.value.trim();
    const groupId = groupInput ? groupInput.value : (window.state.groups[0] ? window.state.groups[0].id : null);
    const pin     = pinInput ? pinInput.value.trim() : "1234";

    if (!name) {
        showToast(t("error_fill_all_fields") || "Please fill all fields.", "error");
        return;
    }
    if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
        showToast(t("error_pin_format") || "PIN must be 4–6 digits.", "error");
        return;
    }

    const newDisp = {
        id: "dispo-" + Date.now(),
        name,
        pin: pin || "1234",
        passwordChanged: false,
        groups: groupId ? [groupId] : [],
        paymentStatus: "Trial",
        trialDaysLeft: 30
    };

    showConfirm(
        (t("confirm_add_dispatcher") || "Add dispatcher") + ': "' + name + '"?',
        function() {
            window.state.dispatchers.push(newDisp);
            saveState();
            if (nameInput) nameInput.value = "";
            if (pinInput)  pinInput.value  = "";
            renderDispatcherSettings();
            showToast((t("dispatcher") || "Dispatcher") + " " + name + " " + (t("added") || "added"), "success");
        },
        { danger: false, title: t("dispatcher") || "Dispatcher", confirmText: t("btn_yes") || "Da" }
    );
}

function renderDispatchersList() {
    const container = document.getElementById("dispatchers-list");
    if (!container) return;

    const dispatchers = (window.state.dispatchers || []).filter(d => !d.isSuperAdmin);

    if (dispatchers.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:20px 0;">${t("no_dispatchers") || "No dispatchers added yet."}</p>`;
        return;
    }

    container.innerHTML = dispatchers.map(d => {
        const groups = (d.groups || []).map(gid => {
            const g = (window.state.groups || []).find(g => g.id === gid);
            return g ? `<span style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}44;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${escapeHtml(g.name)}</span>` : "";
        }).join(" ");

        const statusColor = d.paymentStatus === "Paid" ? "#16a34a" : d.paymentStatus === "Trial" ? "#f59e0b" : "#ef4444";

        return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--card-bg,rgba(255,255,255,0.02));border:1px solid var(--panel-border);border-radius:12px;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                <div style="width:36px;height:36px;border-radius:50%;background:rgba(41,171,226,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i data-lucide="user" style="width:16px;height:16px;color:var(--primary-color);"></i>
                </div>
                <div>
                    <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);">${escapeHtml(d.name)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${groups || '<span style="opacity:0.5;">' + (t("group_none") || "No group") + '</span>'}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <span style="font-size:0.75rem;font-weight:600;color:${statusColor};background:${statusColor}18;border:1px solid ${statusColor}33;padding:3px 10px;border-radius:10px;">${d.paymentStatus || "Trial"}</span>
                <button ${actionAttr("superadminResetPin", [d.id])} title="${t('btn_save_password') || 'Reset PIN'}" style="background:none;border:1px solid var(--panel-border);border-radius:8px;padding:6px 10px;cursor:pointer;color:var(--text-muted);">
                    <i data-lucide="key" style="width:14px;height:14px;"></i>
                </button>
                <button ${actionAttr("removeDispatcher", [d.id])} title="${t('btn_remove') || 'Remove'}" style="background:none;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:6px 10px;cursor:pointer;color:#ef4444;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>
        </div>`;
    }).join("");

    lucide.createIcons();
}

function removeDispatcher(id) {
    showConfirm(t("confirm_delete") || "Remove this dispatcher?", function() {
        window.state.dispatchers = (window.state.dispatchers || []).filter(d => d.id !== id);
        saveState();
        renderDispatcherSettings();
        showToast(t("dispatcher") + " " + (t("removed") || "removed"), "info");
    }, { danger: true });
}

// ============================================================
// CSV EXPORT
// ============================================================
export {
    addDispatcher,
    renderDispatchersList,
    removeDispatcher
};
