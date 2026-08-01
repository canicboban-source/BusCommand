// BusCommand ESM v9.5
import { renderRouteSchematicSVG } from "../maps/route-stops.js";
import { getDriverDutySummary, getTomorrowDutySummary } from "../core/shift-plan.js";
import { todayDateStr } from "../core/utils.js";
import { t } from "../ui/i18n.js";

function renderDispatcherQuickView() {
    const select = document.getElementById("disp-quick-driver-select");
    const detailsContainer = document.getElementById("disp-quick-view-details");
    if (!select || !detailsContainer) return;

    const driverName = select.value;
    if (!driverName) {
        detailsContainer.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; padding: 10px; text-align:center;">${t("no_driver_selected")}</div>`;
        return;
    }

    const driver = window.state.drivers.find(d => d.name === driverName);
    if (!driver) return;

    const today = getDriverDutySummary(driverName, todayDateStr());
    const tomorrow = getTomorrowDutySummary(driverName);

    const statusIcon = driver.active
        ? `<span class="status-indicator active-pulse" style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; margin-right:6px; box-shadow: 0 0 8px #10b981;"></span>`
        : `<span class="status-indicator" style="display:inline-block; width:10px; height:10px; background:#6b7280; border-radius:50%; margin-right:6px;"></span>`;

    const routeLabel = today.route
        ? `${today.route.number} (${today.route.name.split(" - ")[0]})`
        : (today.routeCode || "—");

    detailsContainer.innerHTML = `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 15px; display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.85rem; color:var(--text-muted);">${t("status")}:</span>
                <span style="font-weight:600; display:flex; align-items:center; gap:4px; font-size:0.9rem;">
                    ${statusIcon} ${driver.active ? t("active_duty") : t("inactive_depot")}
                </span>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("today_duty")}</h5>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.88rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("route")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${routeLabel}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("vehicle")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${today.bus}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("shift")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${today.shiftLabel}${today.isBereitschaft ? ' <span style="color:#f59e0b;font-size:0.75rem;">(x2 · poz.1)</span>' : (today.dailyPosition ? ` <span style="color:var(--text-muted);font-size:0.75rem;">(poz.${today.dailyPosition})</span>` : "")}</span>
                    </div>
                    ${today.timeRange ? `<div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">Vreme:</span>
                        <span style="font-weight:600; color:var(--text-main);">${today.timeRange}</span>
                    </div>` : ""}
                </div>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("tomorrow_duty")}</h5>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.88rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("duty_number")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${tomorrow.shift}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("vehicle")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${tomorrow.bus}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--text-muted);">${t("status")}:</span>
                        ${tomorrow.confirmed
                            ? `<span style="color:#10b981; font-weight:600; display:flex; align-items:center; gap:3px; font-size:0.85rem;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i> ${t("released")}</span>`
                            : `<span style="color:#f59e0b; font-weight:600; display:flex; align-items:center; gap:3px; font-size:0.85rem;"><i data-lucide="clock" style="width:12px; height:12px;"></i> ${t("pending")}</span>`
                        }
                    </div>
                </div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("route_progress")}</h5>
                <div id="disp-route-schematic-container" style="min-height: 80px; width: 100%; display: flex; align-items: center; justify-content: center;"></div>
            </div>
        </div>
    `;
    renderRouteSchematicSVG();
    lucide.createIcons();
}

export {
    renderDispatcherQuickView
};
