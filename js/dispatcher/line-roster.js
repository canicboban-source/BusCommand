// BusCommand — Dispo soft-remove from line list (not company roster)
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { isOperationalReadOnly } from "../core/access.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { getGroupById } from "../data/groups.js";
import {
    clearDriverLineMembership,
    driverBelongsToLine,
    lineDetachGroupIds
} from "../data/group-membership.js";
import { withDetachedGroup, busHasGroup } from "../data/bus-group-membership.js";
import { busRevisionOf } from "../data/bus-ops.js";
import { dispoChangeReasonOptions, recordDemoChangeReason } from "./change-reason.js";

async function refreshLineRosterViews() {
    // Dynamic imports keep line-roster off the staff HTML preload graph (D17).
    try {
        const { renderDriversList } = await import("../data/drivers.js");
        renderDriversList();
    } catch { /* optional surface */ }
    try {
        const { renderBusesList } = await import("../data/buses-routes.js");
        renderBusesList();
    } catch { /* optional surface */ }
    if (window.state?.activeGroupHubId) {
        try {
            const { renderGroupHub } = await import("./group-hub.js");
            renderGroupHub();
        } catch { /* optional surface */ }
    }
    if (typeof window.renderDispatcherDashboard === "function") {
        try { window.renderDispatcherDashboard(); } catch { /* optional */ }
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function lineLabel(groupId) {
    const g = getGroupById(groupId);
    return g?.name || String(groupId || "");
}

function applyLocalDriverDetach(driver) {
    clearDriverLineMembership(driver);
    saveState();
}

async function detachDriverFromLine(driverId, groupId) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const id = String(driverId || "").trim();
    const gid = String(groupId || window.state?.activeGroupHubId || "").trim();
    if (!id || !gid) return;

    const driver = (window.state.drivers || []).find((d) => String(d.id) === id);
    if (!driver) {
        showToast(t("dispo_detach_driver_missing") || "Driver not found.", "error");
        return;
    }
    if (!driverBelongsToLine(driver, gid)) {
        showToast(t("dispo_detach_driver_not_on_line") || "Driver is not on this line.", "info");
        return;
    }

    const driverName = driver.name || [driver.firstName, driver.lastName].filter(Boolean).join(" ") || id;
    const line = lineLabel(gid);
    const confirmMsg = (t("dispo_confirm_remove_driver_from_line") || "{driver} will be removed from {line} — stays in the company.")
        .replace("{driver}", driverName)
        .replace("{line}", line);

    showConfirm(confirmMsg, async (payload) => {
        const reason = payload?.reason || "";
        const note = payload?.note || "";
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.detachStaffDriverFromLine(id, gid, { reason, note });
            if (!result?.success) {
                showToast(result?.error || t("dispo_detach_driver_failed") || "Could not remove driver from line.", "error");
                return;
            }
            applyLocalDriverDetach(driver);
        } else {
            applyLocalDriverDetach(driver);
            recordDemoChangeReason({
                type: "driver_detached_from_group",
                driverId: id,
                groupId: gid,
                reason,
                note
            });
            saveState();
        }
        showToast(
            (t("dispo_detach_driver_done") || "{driver} removed from {line}.")
                .replace("{driver}", driverName)
                .replace("{line}", line),
            "success"
        );
        await refreshLineRosterViews();
    }, {
        danger: true,
        title: t("dispo_remove_from_line") || "Remove from line",
        confirmText: t("dispo_remove_from_line") || "Remove from line",
        reasons: dispoChangeReasonOptions()
    });
}

async function detachBusFromLine(busId, groupId) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const id = String(busId || "").trim();
    const gid = String(groupId || window.state?.activeGroupHubId || "").trim();
    if (!id || !gid) return;

    const bus = (window.state.buses || []).find((b) => String(b.id) === id);
    if (!bus) {
        showToast(t("dispo_detach_bus_missing") || "Bus not found.", "error");
        return;
    }

    const detachIds = [...lineDetachGroupIds(gid)];
    const onLine = detachIds.some((g) => busHasGroup(bus, g));
    if (!onLine) {
        showToast(t("dispo_detach_bus_not_on_line") || "Bus is not on this line.", "info");
        return;
    }

    const line = lineLabel(gid);
    const confirmMsg = (t("dispo_confirm_remove_bus_from_line") || "Bus {bus} will be removed from {line} — stays in the company fleet.")
        .replace("{bus}", String(bus.number || id))
        .replace("{line}", line);

    showConfirm(confirmMsg, async (payload) => {
        const reason = payload?.reason || "";
        const note = payload?.note || "";
        const expectedRevision = busRevisionOf(bus);
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.detachStaffBusFromLine(id, gid, expectedRevision, { reason, note });
            if (!result?.success) {
                showToast(result?.error || t("dispo_detach_bus_failed") || "Could not remove bus from line.", "error");
                await refreshLineRosterViews();
                return;
            }
            if (result.bus) {
                const idx = (window.state.buses || []).findIndex((item) => item.id === result.bus.id);
                if (idx >= 0) window.state.buses[idx] = { ...window.state.buses[idx], ...result.bus };
                else window.state.buses.push(result.bus);
            } else {
                Object.assign(bus, withDetachedGroup(bus, detachIds));
            }
        } else {
            Object.assign(bus, withDetachedGroup(bus, detachIds), { revision: expectedRevision + 1 });
            recordDemoChangeReason({
                type: "bus_detached_from_group",
                busId: id,
                groupId: gid,
                reason,
                note
            });
            saveState();
        }
        showToast(
            (t("dispo_detach_bus_done") || "Bus {bus} removed from {line}.")
                .replace("{bus}", String(bus.number || id))
                .replace("{line}", line),
            "success"
        );
        await refreshLineRosterViews();
    }, {
        danger: true,
        title: t("dispo_bus_remove_from_line") || "Remove from this line",
        confirmText: t("dispo_bus_remove_from_line") || "Remove from this line",
        reasons: dispoChangeReasonOptions()
    });
}

export { detachDriverFromLine, detachBusFromLine, refreshLineRosterViews };
