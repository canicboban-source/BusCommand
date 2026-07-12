// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { formatDateTime, showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr as _changeAttr } from "../core/action-delegate.js";

// --- DISPEČERSKE IZGUBLJENE STVARI (LOST & FOUND) ---
function renderDispatcherLostItems() {
    const tbody = document.getElementById("dispatcher-lost-items-table");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    if (window.state.lostItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">${t("js_no_alerts")}</td></tr>`;
        return;
    }
    
    window.state.lostItems.forEach(item => {
        const tr = document.createElement("tr");
        
        let statusBadge = "";
        let actionBtn = "";
        
        // Status check — podržava i ključeve i legacy srpske/njemačke stringove
        const isInDepot = item.status === "status_in_depot" || item.status === "U depou" || item.status === "Im Depot";

        if (isInDepot) {
            statusBadge = `<span class="badge pending">${t("status_in_depot")}</span>`;
            actionBtn = `<button class="btn-table-action btn-approve" ${actionAttr("returnLostItem", [item.id])}><i data-lucide="check"></i> ${t("btn_return_owner")}</button>`;
        } else {
            statusBadge = `<span class="badge approved">${t("status_returned")}</span>`;
            actionBtn = `<span class="text-success" style="font-weight:600;"><i data-lucide="check"></i> ${t("status_returned")}</span>`;
        }

        // Tip predmeta: pokušaj t() za ključ; ako ne uspije (legacy srpski string), prikaži direktno
        const typeDisplay = t(item.type) || item.type;

        tr.innerHTML = `
            <td>${formatDateTime(item.date, item.time)}</td>
            <td><strong>${item.driver}</strong><br><span style="font-size:12px;color:var(--text-muted);">${t("vehicle")} ${item.bus}</span></td>
            <td><strong>${typeDisplay}</strong></td>
            <td>${item.location}</td>
            <td>${item.desc}</td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

function returnLostItem(id) {
    const item = window.state.lostItems.find(i => i.id === id);
    if (item) {
        item.status = "status_returned";
        saveState();
        renderDispatcherLostItems();
        showToast(t("js_lost_returned") || "Item returned to owner.", "success", 3000);
        lucide.createIcons();
    }
}
export {
    renderDispatcherLostItems,
    returnLostItem
};
