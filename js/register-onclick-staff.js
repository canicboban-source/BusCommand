// BusCommand — staff surface shared/login onclick handlers (initial graph)
import { createDispatcherGroup, enterDispatcherActiveGroup, exitImpersonation, saveNewDispatcherPassword, switchToGroupSetup } from "./admin/dispatcher-setup.js";
import { loadSuperadminModule } from "./admin/superadmin-loader.js";
import { forgotDispatcherPassword, loginAsDispatcher, logout } from "./auth/login-dispatcher.js";
import { switchLoginTab } from "./auth/login-ui.js";
import { closeSuperAdminModal, confirmSuperAdminPin, handleLogoClick } from "./auth/superadmin.js";
import { clickElementById, installActionDelegates, removeElementById } from "./core/action-delegate.js";
import { showToast } from "./core/utils.js";
import { resolveSOS } from "./maps/sos-siren.js";
import { switchSection } from "./layout/navigation.js";
import { closeConfirmModal, confirmModalYes } from "./ui/confirm-modal.js";
import { changeLanguage, t } from "./ui/i18n.js";
import { closeModal, closeSosConfirmModal, confirmClearSOS, confirmFactoryReset, confirmResolveSOS, showModal } from "./ui/modals.js";
import { toggleRowActionsMenu } from "./ui/row-actions-menu.js";
import { toggleTheme } from "./ui/theme.js";
import { canInvokeActionDuringDriverActivation } from "./auth/driver-access-gate.js";
import { mergeStaffActionHandlers, staffActionHandlers } from "./staff/staff-action-handlers.js";

/**
 * D17: Super Admin panel handlers lazy-load the SA chunk on first use —
 * the panel is role-gated, so CA/Dispo sessions never pay for it.
 */
const SUPERADMIN_ACTIONS = [
    "superadminOpenCreateModal",
    "superadminCloseCreateModal",
    "superadminSubmitCreateModal",
    "superadminCreateCompany",
    "superadminCreateCompanyAdmin",
    "superadminDeleteCompany",
    "superadminCancelDeleteCompanyModal",
    "superadminConfirmDeleteCompany",
    "superadminDeleteCompanyAdmin",
    "superadminFocusCompanies",
    "superadminCopyCompanyId",
    "superadminCopyText",
    "superadminImpersonate",
    "superadminOpenCompany",
    "superadminOpenCompanyDetail",
    "superadminCloseCompanyDetail",
    "superadminOpenCreateMissingAdmin",
    "superadminSubmitCreateMissingAdmin",
    "superadminCancelCreateMissingAdmin",
    "superadminSetCompanyAdminStatus",
    "superadminResetCompanyAdminPassword",
    "superadminResetPin",
    "superadminToggleStatus",
    "superadminStartSupport",
    "superadminCancelSupportModal",
    "superadminConfirmSupportStart",
    "superadminEndSupport",
    "superadminSaveCompanySettings",
    "superadminOnPlanChange",
    "superadminSaveDemoCompanyProfile"
];

const superadminLazyHandlers = {};
for (const actionName of SUPERADMIN_ACTIONS) {
    superadminLazyHandlers[actionName] = async function (...args) {
        let mod;
        try {
            mod = await loadSuperadminModule();
        } catch {
            showToast(t("plan_import_chunk_load_failed"), "error", 8000);
            return undefined;
        }
        return mod[actionName](...args);
    };
}

const SHARED_HANDLERS = {
    changeLanguage,
    clickElementById,
    closeConfirmModal,
    closeModal,
    closeSosConfirmModal,
    closeSuperAdminModal,
    confirmClearSOS,
    confirmFactoryReset,
    confirmModalYes,
    confirmResolveSOS,
    confirmSuperAdminPin,
    createDispatcherGroup,
    enterDispatcherActiveGroup,
    exitImpersonation,
    forgotDispatcherPassword,
    handleLogoClick,
    loginAsDispatcher,
    logout,
    removeElementById,
    resolveSOS,
    saveNewDispatcherPassword,
    showModal,
    ...superadminLazyHandlers,
    switchLoginTab,
    switchSection,
    switchToGroupSetup,
    t,
    toggleRowActionsMenu,
    toggleTheme
};

export function registerOnclickHandlers(win = window) {
    mergeStaffActionHandlers(SHARED_HANDLERS, win);
    installActionDelegates(staffActionHandlers, document);
    // Keep window bindings in sync for any handler merged later by role graphs.
    for (const [name, fn] of Object.entries(staffActionHandlers)) {
        if (typeof fn === "function") {
            win[name] = (...args) => (canInvokeActionDuringDriverActivation(name) ? fn(...args) : false);
        }
    }
}
