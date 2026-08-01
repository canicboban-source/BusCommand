// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { formatDate } from "../maps/helpers.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";

const pendingVacationActions = new Set();

function appendAction(actions, vacationId, status, className, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn-table-action ${className}`;
    button.dataset.action = "handleVacation";
    button.dataset.actionArgs = JSON.stringify([vacationId, status]);
    button.textContent = t(label);
    button.disabled = pendingVacationActions.has(vacationId);
    actions.appendChild(button);
}

function renderDispatcherVacations() {
    const tbody = document.getElementById("dispatcher-vacation-requests-table");
    if (!tbody) return;
    tbody.replaceChildren();

    const pendingVacations = (window.state.vacations || [])
        .filter(vacation => ["pending", "Na čekanju"].includes(vacation.status));

    if (pendingVacations.length === 0) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.style.textAlign = "center";
        cell.style.color = "var(--text-muted)";
        cell.style.padding = "30px";
        cell.textContent = t("js_no_vacations");
        return;
    }

    pendingVacations.forEach(vacation => {
        const row = tbody.insertRow();
        const driverCell = row.insertCell();
        const driver = document.createElement("strong");
        driver.textContent = vacation.driver || "—";
        driverCell.appendChild(driver);
        row.insertCell().textContent = t(vacation.type);
        row.insertCell().textContent = `${formatDate(vacation.start)} - ${formatDate(vacation.end)}`;

        const daysCell = row.insertCell();
        const days = document.createElement("strong");
        days.textContent = `${vacation.days} ${t("table_days").toLowerCase()}`;
        daysCell.appendChild(days);

        const reasonCell = row.insertCell();
        const reason = document.createElement("span");
        reason.style.fontSize = "13px";
        reason.style.color = "var(--text-muted)";
        reason.textContent = vacation.reason || t("no_data");
        reasonCell.appendChild(reason);

        const actionsCell = row.insertCell();
        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";
        appendAction(actions, vacation.id, "approved", "btn-approve", "btn_approve");
        appendAction(actions, vacation.id, "rejected", "btn-reject", "btn_reject");
        actionsCell.appendChild(actions);
    });
}

function handleVacation(id, status) {
    if (!id || !["approved", "rejected"].includes(status) || pendingVacationActions.has(id)) return;
    const vacation = (window.state.vacations || []).find(item => item.id === id);
    if (!vacation || !["pending", "Na čekanju"].includes(vacation.status)) return;
    const actionLabel = status === "approved" ? t("btn_approve") : t("btn_reject");
    showConfirm(
        `${actionLabel}: "${vacation.driver || "—"}"?`,
        async function() {
            if (pendingVacationActions.has(id)) return;
            pendingVacationActions.add(id);
            renderDispatcherVacations();
            try {
                if (!IS_DEMO_MODE) {
                    const result = await ApiClient.setVacationStatus(id, status);
                    if (!result.success) {
                        showToast(result.error || t("driver_vacation_review_failed"), "error");
                        return;
                    }
                }
                vacation.status = status;
                if (IS_DEMO_MODE) saveState();
                showToast(t("js_vacation_marked") + status.toUpperCase(), "success");
            } finally {
                pendingVacationActions.delete(id);
                renderDispatcherVacations();
            }
        },
        { danger: status !== "approved", title: actionLabel, confirmText: t("btn_yes") || "Da" }
    );
}

export { renderDispatcherVacations, handleVacation };
