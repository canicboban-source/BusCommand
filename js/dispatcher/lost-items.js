// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, formatDateTime, showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";

const pendingLostItemReturns = new Set();

function isLostItemInDepot(status) {
    return status === "in_depot"
        || status === "status_in_depot"
        || status === "U depou"
        || status === "Im Depot";
}

function isLostItemReturned(status) {
    return status === "returned" || status === "status_returned";
}

function renderDispatcherLostItems() {
    const tbody = document.getElementById("dispatcher-lost-items-table");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!Array.isArray(window.state.lostItems) || window.state.lostItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">${t("js_no_alerts")}</td></tr>`;
        return;
    }

    window.state.lostItems.forEach(item => {
        const tr = document.createElement("tr");
        const pending = pendingLostItemReturns.has(item.id);
        const inDepot = isLostItemInDepot(item.status);
        const returned = isLostItemReturned(item.status);

        let statusBadge = "";
        let actionBtn = "";

        if (inDepot) {
            statusBadge = `<span class="badge pending">${escapeHtml(t("status_in_depot"))}</span>`;
            actionBtn = `<button class="btn-table-action btn-approve" ${actionAttr("returnLostItem", [item.id])} ${pending ? "disabled" : ""}>
                <i data-lucide="${pending ? "loader-circle" : "check"}"></i> ${escapeHtml(t(pending ? "lost_returning" : "btn_return_owner"))}
            </button>`;
        } else {
            statusBadge = `<span class="badge approved">${escapeHtml(t("status_returned"))}</span>`;
            actionBtn = `<span class="text-success" style="font-weight:600;"><i data-lucide="check"></i> ${escapeHtml(t("status_returned"))}</span>`;
            if (!returned && item.status) {
                statusBadge = `<span class="badge pending">${escapeHtml(String(item.status))}</span>`;
            }
        }

        const typeDisplay = t(item.type) || item.type;
        const location = item.location || "";
        const desc = item.desc || item.description || "";

        tr.innerHTML = `
            <td>${escapeHtml(formatDateTime(item.date, item.time))}</td>
            <td><strong>${escapeHtml(item.driver || "—")}</strong><br><span style="font-size:12px;color:var(--text-muted);">${escapeHtml(t("vehicle"))} ${escapeHtml(item.bus || "—")}</span></td>
            <td><strong>${escapeHtml(typeDisplay)}</strong></td>
            <td>${escapeHtml(location)}</td>
            <td>${escapeHtml(desc)}</td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function returnLostItem(id) {
    if (!id || pendingLostItemReturns.has(id)) return false;
    if (window.currentUser?.role && !["dispatcher", "company-admin"].includes(window.currentUser.role) && !IS_DEMO_MODE) {
        showToast(t("lost_return_denied") || "Samo disponent može vratiti predmet.", "error");
        return false;
    }
    const item = (window.state.lostItems || []).find(i => i.id === id);
    if (!item || !isLostItemInDepot(item.status)) return false;

    pendingLostItemReturns.add(id);
    renderDispatcherLostItems();
    try {
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.setLostItemStatus(id, "returned");
            if (!result.success) {
                showToast(result.error || t("lost_return_failed") || "Status predmeta nije ažuriran.", "error");
                return false;
            }
            item.status = result.item?.status || "returned";
            item.returnedBy = result.item?.returnedBy || window.currentUser?.id || window.currentUser?.uid;
        } else {
            item.status = "returned";
            saveState();
        }
        showToast(t("js_lost_returned") || "Item returned to owner.", "success", 3000);
        return true;
    } finally {
        pendingLostItemReturns.delete(id);
        renderDispatcherLostItems();
    }
}

export {
    renderDispatcherLostItems,
    returnLostItem,
    isLostItemInDepot,
    isLostItemReturned
};
