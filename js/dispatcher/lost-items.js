// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, formatDateTime, getVisibleDrivers, showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { isOperationalReadOnly } from "../core/access.js";

const pendingLostItemStatus = new Set();
let statusFilter = "open";

function normalizeStatus(status) {
    if (status === "status_in_depot" || status === "U depou" || status === "Im Depot") return "in_depot";
    if (status === "status_returned" || status === "returned_to_owner") return "returned";
    if (status === "stays_on_bus") return "stays_on_bus";
    if (status === "in_depot" || status === "returned") return status;
    return status || "in_depot";
}

function isLostItemInDepot(status) {
    return normalizeStatus(status) === "in_depot";
}

function isLostItemReturned(status) {
    return normalizeStatus(status) === "returned";
}

function isLostItemOpen(status) {
    const value = normalizeStatus(status);
    return value === "in_depot" || value === "stays_on_bus";
}

function statusLabel(status) {
    const value = normalizeStatus(status);
    if (value === "stays_on_bus") return t("status_stays_on_bus");
    if (value === "returned") return t("status_returned");
    return t("status_in_depot");
}

function statusBadgeClass(status) {
    const value = normalizeStatus(status);
    if (value === "returned") return "approved";
    if (value === "stays_on_bus") return "warning";
    return "pending";
}

function bindLostItemFilter() {
    const select = document.getElementById("dispatcher-lost-status-filter");
    if (!select || select.dataset.bound === "1") return;
    select.dataset.bound = "1";
    select.addEventListener("change", () => {
        statusFilter = select.value || "open";
        renderDispatcherLostItems();
    });
}

function matchesDispatcherScope(item) {
    if (window.currentUser?.role !== "dispatcher") return true;
    const visible = getVisibleDrivers();
    const keys = new Set();
    for (const driver of visible) {
        if (driver?.id) keys.add(String(driver.id));
        if (driver?.uid) keys.add(String(driver.uid));
        if (driver?.name) keys.add(String(driver.name));
    }
    const groupIds = new Set();
    for (const driver of visible) {
        if (driver?.groupId) groupIds.add(String(driver.groupId));
        if (driver?.lineId) groupIds.add(String(driver.lineId));
    }
    if (item?.groupId && groupIds.has(String(item.groupId))) return true;
    if (item?.lineId && groupIds.has(String(item.lineId))) return true;
    const driverKey = item?.driverId || item?.driver || item?.driverName;
    if (driverKey && keys.has(String(driverKey))) return true;
    // Items without linkage stay visible only when dispatcher has no group scope data yet.
    if (!item?.groupId && !item?.lineId && !driverKey) return true;
    return false;
}

function matchesFilter(item) {
    if (!matchesDispatcherScope(item)) return false;
    const status = normalizeStatus(item.status);
    if (statusFilter === "all") return true;
    if (statusFilter === "open") return status === "in_depot" || status === "stays_on_bus";
    return status === statusFilter;
}

function actionButtons(item) {
    const status = normalizeStatus(item.status);
    const pending = pendingLostItemStatus.has(item.id);
    if (status === "returned") {
        return `<span class="text-success" style="font-weight:600;"><i data-lucide="check"></i> ${escapeHtml(t("status_returned"))}</span>`;
    }
    const buttons = [];
    if (status !== "in_depot") {
        buttons.push(`<button class="btn-table-action" ${actionAttr("setLostItemStatus", [item.id, "in_depot"])} ${pending ? "disabled" : ""}>
            ${escapeHtml(t("status_in_depot"))}</button>`);
    }
    if (status !== "stays_on_bus") {
        buttons.push(`<button class="btn-table-action" ${actionAttr("setLostItemStatus", [item.id, "stays_on_bus"])} ${pending ? "disabled" : ""}>
            ${escapeHtml(t("status_stays_on_bus"))}</button>`);
    }
    buttons.push(`<button class="btn-table-action btn-approve" ${actionAttr("setLostItemStatus", [item.id, "returned"])} ${pending ? "disabled" : ""}>
        <i data-lucide="${pending ? "loader-circle" : "check"}"></i> ${escapeHtml(t(pending ? "lost_returning" : "btn_return_owner"))}
    </button>`);
    return `<div class="lost-item-actions">${buttons.join(" ")}</div>`;
}

function photoDataUrl(item) {
    if (item?.photo?.dataUrl) return item.photo.dataUrl;
    if (item?.photoDataUrl) return item.photoDataUrl;
    if (item?.photo?.contentType && item?.photo?.dataBase64) {
        return `data:${item.photo.contentType};base64,${item.photo.dataBase64}`;
    }
    return null;
}

function photoCell(item) {
    const url = photoDataUrl(item);
    if (!url) return `<span style="color:var(--text-muted);">—</span>`;
    return `<button type="button" class="lost-item-photo-thumb" ${actionAttr("openLostItemPhoto", [item.id])} aria-label="${escapeHtml(t("lost_photo_view"))}">
        <img src="${escapeHtml(url)}" alt="" width="40" height="40" style="object-fit:cover;border-radius:6px;">
    </button>`;
}

function renderDispatcherLostItems() {
    bindLostItemFilter();
    const tbody = document.getElementById("dispatcher-lost-items-table");
    if (!tbody) return;

    tbody.innerHTML = "";
    const items = (window.state.lostItems || []).filter(matchesFilter);

    if (!Array.isArray(window.state.lostItems) || window.state.lostItems.length === 0 || items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">${t("js_no_alerts")}</td></tr>`;
        return;
    }

    items.forEach((item) => {
        const tr = document.createElement("tr");
        const typeDisplay = t(item.type) || item.type;
        const location = item.location || "";
        const desc = item.desc || item.description || "";
        const when = formatDateTime(item.date || (item.foundAt || "").slice(0, 10), item.time || (item.foundAt || "").slice(11, 16));
        tr.innerHTML = `
            <td>${escapeHtml(when)}</td>
            <td><strong>${escapeHtml(item.driver || "—")}</strong><br><span style="font-size:12px;color:var(--text-muted);">${escapeHtml(t("vehicle"))} ${escapeHtml(item.bus || "—")}</span></td>
            <td><strong>${escapeHtml(typeDisplay)}</strong></td>
            <td>${escapeHtml(location)}</td>
            <td>${escapeHtml(desc)}</td>
            <td>${photoCell(item)}</td>
            <td><span class="badge ${statusBadgeClass(item.status)}">${escapeHtml(statusLabel(item.status))}</span></td>
            <td>${actionButtons(item)}</td>
        `;
        tbody.appendChild(tr);
    });
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function setLostItemStatus(id, nextStatus) {
    if (!id || !nextStatus || pendingLostItemStatus.has(id)) return false;
    if (isOperationalReadOnly() || (window.currentUser?.role && window.currentUser.role !== "dispatcher" && !USE_LOCAL_STATE)) {
        showToast(t("lost_return_denied") || "Samo disponent može menjati status.", "error");
        return false;
    }
    const item = (window.state.lostItems || []).find((entry) => entry.id === id);
    if (!item || isLostItemReturned(item.status)) return false;

    pendingLostItemStatus.add(id);
    renderDispatcherLostItems();
    try {
        if (!USE_LOCAL_STATE) {
            const result = await ApiClient.setLostItemStatus(id, nextStatus);
            if (!result.success) {
                showToast(result.error || t("lost_return_failed") || "Status predmeta nije ažuriran.", "error");
                return false;
            }
            item.status = result.item?.status || nextStatus;
            item.returnedBy = result.item?.returnedBy || item.returnedBy;
        } else {
            item.status = nextStatus;
            saveState();
        }
        showToast(
            nextStatus === "returned"
                ? (t("js_lost_returned") || "Item returned to owner.")
                : (t("lost_status_updated") || "Status updated."),
            "success",
            3000
        );
        return true;
    } finally {
        pendingLostItemStatus.delete(id);
        renderDispatcherLostItems();
    }
}

async function returnLostItem(id) {
    return setLostItemStatus(id, "returned");
}

function openLostItemPhoto(id) {
    const item = (window.state.lostItems || []).find((entry) => entry.id === id);
    const url = photoDataUrl(item);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
}

export {
    renderDispatcherLostItems,
    returnLostItem,
    setLostItemStatus,
    openLostItemPhoto,
    isLostItemInDepot,
    isLostItemReturned,
    isLostItemOpen
};
