// BusCommand ESM v9.5
import { initializeLoginSelects } from "../auth/login-ui.js";
import { saveState } from "../core/state.js";
import { escapeHtml, getVisibleDrivers, showToast } from "../core/utils.js";
import { getGroupById, renderGroupsList } from "./groups.js";
import { assignDriverToLine, getDriversForLineGroup } from "./group-membership.js";
import { getActiveLineId } from "./groups.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t, tp } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";

window.editingDriverId = null;

function renderDriversList() {
    const list = document.getElementById("settings-drivers-list");
    if (!list) return;
    list.innerHTML = "";

    const hubId = window.state.activeGroupHubId;
    let myDrivers = hubId ? getDriversForLineGroup(hubId) : getVisibleDrivers();
    
    const canDeleteDrivers = USE_LOCAL_STATE || window.currentUser?.role === "company-admin";
    const canDetachFromLine = USE_LOCAL_STATE || window.currentUser?.role === "dispatcher";
    const detachGroupId = hubId || window.currentUser?.activeGroupId || "";

    myDrivers.forEach(d => {
        const grp = getGroupById(d.groupId);
        const driverName = d.name || [d.firstName, d.lastName].filter(Boolean).join(" ") || t("driver");
        const groupColor = /^#[0-9a-f]{6}$/i.test(String(grp?.color || ""))
            ? grp.color
            : "var(--primary-color)";
        const isDispatcher = window.currentUser?.role === "dispatcher";
        const li = document.createElement("li");
        const active = d.active !== false;
        const statusLabel = t(active ? "driver_status_active" : "driver_status_inactive");
        const statusAction = t(active ? "driver_deactivate" : "driver_activate");
        li.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-left: 3px solid " + groupColor + "; border-radius: var(--radius-md); margin-bottom: 8px;";
        const idBadge = isDispatcher
            ? ""
            : `<span style="color: var(--primary-color); font-size: 12px; font-weight: normal; margin-left: 8px;">(${escapeHtml(t("label_company_id") || "ID")}: ${escapeHtml(d.companyId || "N/A")})</span>`;
        const detachBtn = canDetachFromLine && detachGroupId && d.id
            ? `<button type="button" class="btn-secondary" ${actionAttr("detachDriverFromLine", [d.id, detachGroupId])} title="${escapeHtml(t("dispo_remove_from_line_hint") || "")}" style="padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;white-space:nowrap;">
                ${escapeHtml(t("dispo_remove_from_line") || "Remove from line")}
            </button>`
            : "";
        li.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
                <span style="font-weight: 600; color: var(--text-main);">${escapeHtml(driverName)}
                    ${idBadge}
                    ${grp ? `<span style="background:${groupColor}22;border:1px solid ${groupColor}55;color:${groupColor};font-size:10px;font-weight:700;padding:1px 8px;border-radius:12px;margin-left:6px;">${escapeHtml(grp.name)}</span>` : ""}
                    <span style="font-size:10px;font-weight:700;margin-left:6px;color:${active ? "var(--success-color, #16a34a)" : "var(--text-muted)"};">${escapeHtml(statusLabel)}</span>
                </span>
                <span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(d.phone || t("no_phone"))} | ${escapeHtml(d.email || t("no_email"))}</span>
            </div>
            <div style="display:flex; gap:6px;">
                ${USE_LOCAL_STATE ? `<button class="btn-edit-item" ${actionAttr("editDriver", [d.id])} style="background:rgba(59,130,246,0.08);color:#3b82f6;border:1px solid rgba(59,130,246,0.2);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;white-space:nowrap;">
                    ${t("btn_edit")}
                </button>` : ""}
                ${detachBtn}
                ${canDeleteDrivers ? `<button class="btn-delete-item" ${actionAttr("toggleDriverActive", [d.id])} aria-label="${escapeHtml(statusAction)}" title="${escapeHtml(statusAction)}" style="background:rgba(239,68,68,0.08);color:${active ? "#ef4444" : "#16a34a"};border:1px solid currentColor;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;white-space:nowrap;">
                    ${escapeHtml(statusAction)}
                </button>` : ""}
            </div>
        `;
        list.appendChild(li);
    });
}

function editDriver(id) {
    if (!USE_LOCAL_STATE) return;
    const d = window.state.drivers.find(drv => drv.id === id);
    if (!d) return;

    window.editingDriverId = id;

    document.getElementById("new-driver-name").value = d.name || "";
    document.getElementById("new-driver-company-id").value = d.companyId || "";
    document.getElementById("new-driver-pin").value = d.pin || "";
    if (document.getElementById("new-driver-phone")) {
        document.getElementById("new-driver-phone").value = d.phone || "";
    }
    if (document.getElementById("new-driver-email")) {
        document.getElementById("new-driver-email").value = d.email || "";
    }
    
    const groupSelect = document.getElementById("new-driver-group");
    if (groupSelect) {
        groupSelect.value = d.groupId || "";
    }

    // Promeni dugme forme da piše "Sačuvaj izmene"
    const submitBtn = document.querySelector("#add-driver-form button[type='submit']");
    if (submitBtn) {
        submitBtn.innerHTML = `<i data-lucide="check"></i> <span>${t("btn_save_changes")}</span>`;
        if (typeof lucide !== "undefined") lucide.createIcons();
    }

    showToast(t("driver_loaded_to_form"), "info");
    document.getElementById("add-driver-form").scrollIntoView({ behavior: "smooth" });
}

function addDriver(event) {
    event.preventDefault();
    if (!USE_LOCAL_STATE) return;
    const nameInput = document.getElementById("new-driver-name");
    const companyIdInput = document.getElementById("new-driver-company-id");
    const pinInput = document.getElementById("new-driver-pin");
    const phoneInput = document.getElementById("new-driver-phone");
    const emailInput = document.getElementById("new-driver-email");
    const groupSelect = document.getElementById("new-driver-group");
    
    const name = nameInput.value.trim();
    const companyId = companyIdInput.value.trim();
    const pin = pinInput.value.trim();
    const phone = phoneInput?.value?.trim() || "";
    const email = emailInput?.value?.trim() || "";
    const groupId = window.state.activeGroupHubId || (groupSelect ? groupSelect.value : "");
    
    if (!name || !companyId || !pin) return;
    
    if (window.editingDriverId) {
        const d = window.state.drivers.find(drv => drv.id === window.editingDriverId);
        if (d) {
            d.name = name;
            d.companyId = companyId;
            d.pin = pin;
            d.phone = phone;
            d.email = email;
            d.groupId = groupId;
            
            saveState();
            
            // Resetuj formu
            nameInput.value = "";
            companyIdInput.value = "";
            pinInput.value = "";
            phoneInput.value = "";
            emailInput.value = "";
            if (groupSelect) groupSelect.value = "";
            
            window.editingDriverId = null;
            
            const submitBtn = document.querySelector("#add-driver-form button[type='submit']");
            if (submitBtn) {
                submitBtn.innerHTML = `<i data-lucide="plus"></i> <span>${t("btn_add_driver")}</span>`;
            }
            
            renderDriversList();
            initializeLoginSelects();
            showToast(t("driver_changes_saved"), "success");
            lucide.createIcons();
        }
        return;
    }
    
    const newDriver = {
        id: `drv-${Date.now()}`,
        name: name,
        companyId: companyId,
        pin: pin,
        phone: phone,
        email: email,
        groupId: groupId || window.state.activeGroupHubId || ""
    };
    const hubId = window.state.activeGroupHubId;
    if (hubId) assignDriverToLine(newDriver, hubId);
    
    showConfirm(
        (t("confirm_add_driver") || "Dodaj vozača") + ': "' + name + '"?',
        function() {
            window.state.drivers.push(newDriver);
            saveState();
            nameInput.value = "";
            companyIdInput.value = "";
            pinInput.value = "";
            phoneInput.value = "";
            emailInput.value = "";
            if (groupSelect) groupSelect.value = "";
            
            renderDriversList();
            initializeLoginSelects();
            showToast(name + " — " + (t("driver_added") || "vozač dodan"), "success");
            lucide.createIcons();
        },
        { danger: false, title: t("btn_add_driver") || "Dodaj vozača", confirmText: t("btn_yes") || "Da" }
    );
}

function toggleDriverActive(id) {
    const driver = window.state.drivers.find(d => d.id === id);
    if (!driver) return;
    const nextActive = driver.active === false;
    const driverName = driver.name || [driver.firstName, driver.lastName].filter(Boolean).join(" ") || t("driver");
    const message = t(nextActive ? "driver_confirm_activate" : "driver_confirm_deactivate", { name: driverName });
    showConfirm(message, async function() {
        if (!USE_LOCAL_STATE) {
            const result = await ApiClient.setDriverActive(id, nextActive);
            if (!result.success) {
                showToast(result.error || t("driver_status_failed"), "error");
                return;
            }
        }
        driver.active = nextActive;
        if (USE_LOCAL_STATE) saveState();
        renderDriversList();
        initializeLoginSelects();
        showToast(t(nextActive ? "driver_activated" : "driver_deactivated"), "success");
        if (typeof lucide !== "undefined") lucide.createIcons();
    }, { danger: !nextActive });
}

function importDriversExcel(event) {
    // Legacy Excel import
    event.preventDefault();
}

function importDriversBulk() {
    if (!USE_LOCAL_STATE) return;
    const textarea = document.getElementById("bulk-drivers-input");
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) {
        showToast(t("driver_import_enter_data"), "error");
        return;
    }

    const lines = text.split("\n");
    let importCount = 0;
    let newGroupsCount = 0;

    if (!Array.isArray(window.state.drivers)) window.state.drivers = [];
    if (!Array.isArray(window.state.groups)) window.state.groups = [];

    lines.forEach((line) => {
        const row = line.trim();
        if (!row) return;

        const cols = row.split(/[,\t;]/).map(c => c.trim());
        if (cols.length < 2) return; 

        const name = cols[0];
        const pin = cols[1];
        const groupName = cols[2] || "";
        const companyId = cols[3] || "";
        const phone = cols[4] || "";
        const email = cols[5] || "";

        if (name.toLowerCase().includes("ime") || name.toLowerCase().includes("name") || pin.toLowerCase().includes("pin")) {
            return;
        }

        if (!name || !pin) return;

        let groupId = "";
        if (groupName) {
            let grp = window.state.groups.find(g => g.name.toLowerCase() === groupName.toLowerCase());
            if (!grp) {
                const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899", "#14b8a6"];
                const color = colors[window.state.groups.length % colors.length];
                grp = {
                    id: `grp-${Date.now()}-${newGroupsCount}`,
                    name: groupName,
                    color: color,
                    active: true
                };
                window.state.groups.push(grp);
                newGroupsCount++;
            }
            groupId = grp.id;
        }

        const existingIdx = window.state.drivers.findIndex(d => d.name.toLowerCase() === name.toLowerCase());
        const driverEntry = {
            id: existingIdx >= 0 ? window.state.drivers[existingIdx].id : `drv-${Date.now()}-${importCount}`,
            name: name,
            pin: pin,
            groupId: groupId,
            companyId: companyId || (existingIdx >= 0 && window.state.drivers[existingIdx].companyId ? window.state.drivers[existingIdx].companyId : `ID-${Math.floor(100000 + Math.random() * 900000)}`),
            phone: phone,
            email: email
        };

        const hubId = window.state.activeGroupHubId || getActiveLineId();
        if (!hubId) {
            showToast(t("driver_import_open_group"), "error");
            return;
        }
        assignDriverToLine(driverEntry, hubId, groupName);

        if (existingIdx >= 0) {
            window.state.drivers[existingIdx] = driverEntry;
        } else {
            window.state.drivers.push(driverEntry);
        }
        importCount++;
    });

    saveState();
    renderDriversList();
    initializeLoginSelects();
    textarea.value = "";
    showToast(tp("driver_import_success", importCount, { count: importCount }), "success");
    if (newGroupsCount > 0) {
        showToast(t("groups_created_on_import", { count: newGroupsCount }), "info");
        renderGroupsList();
    }
}

function importDriversFromFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const textarea = document.getElementById("bulk-drivers-input");
        if (textarea) {
            textarea.value = e.target.result;
        }
    };
    reader.readAsText(file);
}

export {
    renderDriversList,
    addDriver,
    toggleDriverActive,
    editDriver,
    importDriversExcel,
    importDriversBulk,
    importDriversFromFile
};
