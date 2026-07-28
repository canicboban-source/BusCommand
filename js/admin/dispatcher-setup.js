// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { activateShiftCatalogForLine } from "../core/line-shift-catalog.js";
import { showToast } from "../core/utils.js";
import { rejectDispatcherWithoutGroups } from "../auth/login-ui.js";
import { persistUserSession, syncUserSession } from "../auth/login-session.js";
import { clearAllPasswordFields, clearAuthSetupFields } from "../auth/password-fields.js";
import { openGroupHub } from "../dispatcher/group-hub.js";
import { showAppLayout } from "../layout/shell.js";
import { t } from "../ui/i18n.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";

function exitImpersonation() {
    // Remove read-only banner
    const banner = document.getElementById("readonly-banner");
    if (banner) banner.remove();
    
    window.currentUser = {
        role: "superadmin",
        name: t("role_superadmin"),
        id: "superadmin"
    };
    persistUserSession(window.currentUser);
    showAppLayout();
    showToast(t("sa_returned_to_mode"));
}

function saveNewDispatcherPassword() {
    const dispId = document.getElementById("setup-dispatcher-id").value;
    const newPwd = document.getElementById("setup-new-pin").value.trim();
    const confirmPwd = document.getElementById("setup-confirm-pin").value.trim();

    if (newPwd.length < 6) {
        showToast(t("ca_password_min") || "Lozinka mora imati najmanje 6 karaktera", "error");
        return;
    }

    if (newPwd !== confirmPwd) {
        showToast(t("ca_password_mismatch") || "Lozinke se ne poklapaju", "error");
        return;
    }

    const disp = window.state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;

    disp.password = newPwd;
    disp.pin = newPwd;
    disp.passwordChanged = true;
    saveState();
    
    clearAuthSetupFields();
    document.getElementById("dispatcher-password-setup-view").classList.add("hidden");
    
    // Log in immediately
    window.currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        activeGroupId: null
    };
    persistUserSession(window.currentUser);

    if (rejectDispatcherWithoutGroups(disp)) {
        showToast(t("msg_password_saved") || "Password saved!", "success");
        return;
    }

    showAppLayout();
    showToast(t("msg_password_saved") || "Password saved!", "success");
}

function populateGroupSetupSelect(dispId) {
    const select = document.getElementById("group-setup-select");
    if (!select) return;
    select.innerHTML = "";
    
    const disp = window.state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    const groups = disp.groups || [];
    const container = document.getElementById("group-select-container");
    
    if (groups.length === 0) {
        if (container) container.style.display = "none";
    } else {
        if (container) container.style.display = "block";
        groups.forEach(gId => {
            const opt = document.createElement("option");
            opt.value = gId;
            opt.innerText = `Group / Linija ${gId}`;
            select.appendChild(opt);
        });
    }
}

function createDispatcherGroup() {
    if (!IS_DEMO_MODE) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    const idInput = document.getElementById("setup-new-group-id");
    const nameInput = document.getElementById("setup-new-group-name");
    if (!idInput || !nameInput) return;
    
    const id = idInput.value.trim();
    const name = nameInput.value.trim() || `Route ${id}`;
    
    if (!id) {
        showToast(t("group_err_name") || "Enter a group name", "error");
        return;
    }
    
    const currentDispId = window.currentUser ? window.currentUser.id : document.getElementById("setup-dispatcher-id").value;
    const disp = window.state.dispatchers.find(d => d.id === currentDispId);
    if (!disp) return;
    
    if (!disp.groups) disp.groups = [];
    if (disp.groups.includes(id)) {
        showToast(t("group_err_exists") || "Group already exists", "error");
        return;
    }
    
    if (!window.state.groups) window.state.groups = [];
    if (!window.state.groups.some(g => g.id === id)) {
        window.state.groups.push({
            id,
            name,
            color: "#a6001a",
            lineId: id,
            active: true,
            companyId: disp.companyId || window.currentUser?.companyId || "demo"
        });
    }
    
    disp.groups.push(id);
    disp.activeGroupId = id;
    activateShiftCatalogForLine(id);
    saveState();
    
    idInput.value = "";
    nameInput.value = "";
    
    if (!window.currentUser) {
        window.currentUser = { role: "dispatcher", name: disp.name, id: disp.id, activeGroupId: id };
        persistUserSession(window.currentUser);
    } else {
        window.currentUser.activeGroupId = id;
        syncUserSession(window.currentUser);
    }
    
    document.getElementById("dispatcher-group-setup-view").classList.add("hidden");
    showAppLayout();
    showToast(t("group_added") || "Grupa dodata — sada uvezite vozače i plan.", "success", 6000);
    openGroupHub(id);
}

function enterDispatcherActiveGroup() {
    const select = document.getElementById("group-setup-select");
    if (!select) return;
    
    const gId = select.value;
    if (!gId) {
        showToast("Please select a group", "error");
        return;
    }
    
    const currentDispId = window.currentUser ? window.currentUser.id : document.getElementById("setup-dispatcher-id").value;
    const disp = window.state.dispatchers.find(d => d.id === currentDispId);
    if (!disp) return;
    
    disp.activeGroupId = gId;
    saveState();
    
    if (!window.currentUser) {
        window.currentUser = { role: "dispatcher", name: disp.name, id: disp.id, activeGroupId: gId };
        persistUserSession(window.currentUser);
    } else {
        window.currentUser.activeGroupId = gId;
        syncUserSession(window.currentUser);
    }
    
    document.getElementById("dispatcher-group-setup-view").classList.add("hidden");
    showAppLayout();
    openGroupHub(gId);
}

function switchToGroupSetup() {
    const disp = window.state.dispatchers.find(d => d.id === window.currentUser?.id);
    if (!disp || !disp.groups || disp.groups.length === 0) {
        rejectDispatcherWithoutGroups(disp || {});
        return;
    }
    document.getElementById("app-container").classList.add("hidden");
    clearAllPasswordFields();
    document.getElementById("dispatcher-group-setup-view").classList.remove("hidden");
    populateGroupSetupSelect(window.currentUser.id);
    const createBlock = document.getElementById("group-setup-create-block");
    if (createBlock) createBlock.style.display = "none";
    lucide.createIcons();
}

export {
    exitImpersonation,
    saveNewDispatcherPassword,
    populateGroupSetupSelect,
    createDispatcherGroup,
    enterDispatcherActiveGroup,
    switchToGroupSetup
};
