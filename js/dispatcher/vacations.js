// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { formatDate } from "../maps/helpers.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";

// --- DISPEČERSKI ODMORI ---
function renderDispatcherVacations() {
    const tbody = document.getElementById("dispatcher-vacation-requests-table");
    tbody.innerHTML = "";
    
    const pendingVacations = window.state.vacations.filter(v => v.status === "Na čekanju");
    
    if (pendingVacations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">${t("js_no_vacations")}</td></tr>`;
        return;
    }
    
    pendingVacations.forEach(vac => {
        const tr = document.createElement("tr");
        
        let translatedType = t(vac.type);
        
        tr.innerHTML = `
            <td><strong>${vac.driver}</strong></td>
            <td>${translatedType}</td>
            <td>${formatDate(vac.start)} - ${formatDate(vac.end)} (2026)</td>
            <td><strong>${vac.days} ${t("table_days").toLowerCase()}</strong></td>
            <td><span style="font-size:13px;color:var(--text-muted);">${vac.reason}</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-table-action btn-approve" ${actionAttr("handleVacation", [vac.id, "approved"])}>${t("btn_approve")}</button>
                    <button class="btn-table-action btn-reject" ${actionAttr("handleVacation", [vac.id, "rejected"])}>${t("btn_reject")}</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function handleVacation(id, status) {
    const vac = window.state.vacations.find(v => v.id === id);
    if (!vac) return;
    const actionLabel = status === "approved"
        ? (t("btn_approve") || "Odobri")
        : (t("btn_reject") || "Odbij");
    showConfirm(
        actionLabel + ': "' + vac.driver + '"?',
        function() {
            vac.status = status;
            saveState();
            renderDispatcherVacations();
            showToast(t("js_vacation_marked") + status.toUpperCase(), "success");
        },
        { danger: status !== "approved", title: actionLabel, confirmText: t("btn_yes") || "Da" }
    );
}
export {
    renderDispatcherVacations,
    handleVacation
};
