// BusCommand — staff surface action handlers
import { handleCompanyAuditFilters, loadMoreCompanyAudit, refreshCompanyAudit, resetCompanyAuditFilters } from "./admin/company-admin-audit.js";
import { applyBrandingSettings, clearCompanyBrandingLogo, handleCompanyBrandingLogoFile } from "./admin/company-admin-branding.js";
import { changeCompanyDriversPage, clearCompanyDriversImport, closeCompanyDriverAddModal, closeCompanyDriverEdit, confirmCompanyDriversImport, handleCompanyDriversFile, handleCompanyDriversFilter, handleCompanyDriversSearch, openCompanyDriverAddModal, openCompanyDriverEdit, saveCompanyDriverEdit, submitCompanyDriverManualAdd, toggleCompanyDriverStatus } from "./admin/company-admin-drivers.js";
import { cancelCompanyGroupEdit, deleteCompanyGroup, focusCompanyGroupForm, saveCompanyGroup, startEditCompanyGroup } from "./admin/company-admin-groups.js";
import { clearCompanyServicePlanPreview, closeCompanyServicePlanDuty, closeCompanyServicePlanHistory, handleCompanyServicePlanFile, handleCompanyServicePlanGroupChange, openCompanyServicePlanDuty, openCompanyServicePlanHistory, publishCompanyServicePlan, activateCompanyServicePlanVersion } from "./admin/company-admin-service-plan.js";
import { handleCompanySettingsCountry, handleCompanySettingsInput, resetCompanySettingsForm, saveCompanyProfileSettings } from "./admin/company-admin-settings.js";
import { addCompanyDispatcher, focusCompanyDispatcherForm, removeCompanyDispatcher, resetCompanyDispatcherPassword, revokeCompanyDispatcherSessions, saveCompanyDispatcherGroups, saveCompanyDispatcherProfile, toggleCaDispGroupsEdit, toggleCaDispProfileEdit, toggleCompanyDispatcherStatus } from "./admin/company-admin-team.js";
import { endCompanySupportSession, openCompanyOpsOverview } from "./admin/company-admin.js";
import { createDispatcherGroup, enterDispatcherActiveGroup, exitImpersonation, saveNewDispatcherPassword, switchToGroupSetup } from "./admin/dispatcher-setup.js";
import { superadminCreateCompany, superadminCreateCompanyAdmin, superadminDeleteCompany, superadminCancelDeleteCompanyModal, superadminConfirmDeleteCompany, superadminDeleteCompanyAdmin, superadminFocusCompanies, superadminCopyCompanyId, superadminCopyText, superadminImpersonate, superadminOpenCompany, superadminOpenCompanyDetail, superadminCloseCompanyDetail, superadminOpenCreateMissingAdmin, superadminSubmitCreateMissingAdmin, superadminCancelCreateMissingAdmin, superadminSetCompanyAdminStatus, superadminResetCompanyAdminPassword, superadminResetPin, superadminToggleStatus, superadminStartSupport, superadminCancelSupportModal, superadminConfirmSupportStart, superadminEndSupport, superadminSaveCompanySettings, superadminOnPlanChange, superadminSaveDemoCompanyProfile, superadminOpenCreateModal, superadminCloseCreateModal, superadminSubmitCreateModal } from "./admin/superadmin.js";
import { forgotDispatcherPassword, loginAsDispatcher, logout } from "./auth/login-dispatcher.js";
import { closeSuperAdminModal, confirmSuperAdminPin, handleLogoClick } from "./auth/superadmin.js";
import { clickElementById, installActionDelegates, removeElementById } from "./core/action-delegate.js";
import { exportDriversCSV, exportLostItemsCSV, exportReportsCSV } from "./core/export-csv.js";
import { getScheduleByKey, showToast } from "./core/utils.js";
import { loadPlanImport, prefetchPlanImport } from "./dispatcher/plan-import-loader.js";
import { loadMsgCompose } from "./dispatcher/msg-compose-loader.js";
import { addBus, deleteBus, deleteRoute, toggleBusEdit, saveBusOpsProfile, quickSetBusStatus, changeBusGroup } from "./data/buses-routes.js";
import {
    clearBusImportPreview,
    confirmBusImport,
    handleBusImportDrop,
    handleBusImportFile,
    handleBusImportPaste
} from "./data/bus-import.js";
import { addDriver, editDriver, toggleDriverActive } from "./data/drivers.js";
import { deleteGroup, setGroupFilter } from "./data/groups.js";
import { clearScheduleFile, clearScheduleText, deleteScheduleEntry, formatScheduleText, handleScheduleDrop, handleScheduleFileSelect, insertScheduleTable, sendScheduleToDrivers, switchScheduleTab } from "./data/schedules.js";
import {
    updateDriverBusInline,
    updateDriverShiftInline,
    opsAssignDriver,
    openOperationalIncident,
    openVehicleOperationalIncident,
    closeOperationalIncident,
    openCoverageResolver,
    closeCoverageResolver,
    transitionOperationalIncident,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
    focusOpsAttentionItem,
    applyOpsAttentionFix
} from "./dispatcher/dashboard.js";
import { removeDispatcher } from "./dispatcher/dispatchers.js";
import { backFromPlanFullPage, closeGroupHub, openDailyPlanForGroup, openDailyPlanFull, openGroupHub, openMonthlyPlanForGroup as openMonthlyPlanForGroupCore, openMonthlyPlanImport as openMonthlyPlanImportCore, openMonthlyPlansFull as openMonthlyPlansFullCore, openVehiclesFromPlan, scrollHubSection } from "./dispatcher/group-hub.js";
import { returnLostItem, setLostItemStatus, openLostItemPhoto } from "./dispatcher/lost-items.js";
import { closeMonthlyDayEditModal, createEmptyMonthlyPlan, deleteMonthlyPlan, exportMonthlyGroupPlanCsv, focusMonthlyDriverPlan, loadMonthlyPlanForDriver, onMedCatalogSelectChange, onMedDaySelectChange, onMedShiftTypeChange, openMonthlyDayEdit, openMonthlyDayEditForDriver, previewMonthlyMassAbsence, saveMonthlyDayEdit, selectMonthlyPlanGroup, undoMonthlyDayEdit } from "./dispatcher/monthly-plans.js";
import { goToOpsPlanProblems } from "./dispatcher/plan-health-banner.js";
import { openVehiclesForGroup } from "./dispatcher/vehicles-panel.js";
import { resolveReport, openReportResolution, closeReportResolution } from "./dispatcher/reports.js";
import { shiftWeekNav } from "./dispatcher/shift-utils.js";
import { assignShift, openShiftCell, persistShift, removeShift } from "./dispatcher/shifts.js";
import { dailyPlanAssignDriver, clearDailyShift } from "./dispatcher/daily-plan.js";
import {
    acquirePlanEditLock,
    releasePlanEditLock,
    breakPlanEditLock,
    confirmBreakPlanEditLock,
    refreshPlanLockBanner
} from "./dispatcher/plan-edit-lock-ui.js";
import { handleVacation } from "./dispatcher/vacations.js";
import { resolveSOS } from "./maps/sos-siren.js";
import { wizardAddDriverRow, wizardBack, wizardHandleLogo, wizardNext, wizardSelectColor, wizardSkip } from "./features/onboarding.js";
import { changeCalendarMonth } from "./features/print-calendar.js";
import { clearPackageImport, confirmPackageImport, handlePackageImportDrop, handlePackageImportInput } from "./imports/package-import.js";
import { switchSection } from "./layout/navigation.js";
import { viewDamagePhoto } from "./maps/damage-photo.js";
import { uploadDriverSchedule } from "./maps/schedule-upload.js";
import { viewUploadedSchedule } from "./maps/schedule-viewer.js";
import { closeConfirmModal, confirmModalYes } from "./ui/confirm-modal.js";
import { changeLanguage, t } from "./ui/i18n.js";
import { closeModal, closeSosConfirmModal, confirmClearSOS, confirmFactoryReset, confirmResolveSOS, showModal } from "./ui/modals.js";
import { toggleRowActionsMenu } from "./ui/row-actions-menu.js";
import { toggleTheme } from "./ui/theme.js";
import { canInvokeActionDuringDriverActivation } from "./auth/driver-access-gate.js";

/** Lazy Dispo Help chunk — keeps D17 staff budget under soft ceiling. */
function loadDispatcherHelp() {
    return import("./dispatcher/help-support.js");
}

/** Lazy CA onboarding wizard — not needed for Dispo monthly plan path. */
function loadCompanyAdminOnboarding() {
    return import("./admin/company-admin-onboarding.js");
}

/**
 * Lazy monthly plan-import chunk (2R-B / D17) — not in staff initial graph.
 * 2R-B.1 / 2R-B.1.1: rejected loads are not permanently cached; file/drop snapshots
 * are taken synchronously before awaiting the chunk.
 */
async function withPlanImportModule(run) {
    let mod;
    try {
        mod = await loadPlanImport();
    } catch {
        showToast(t("plan_import_chunk_load_failed"), "error", 8000);
        return undefined;
    }
    // Errors from an already-loaded module must propagate — they are not chunk-load failures.
    return run(mod);
}

async function clearPendingPlanImports(...args) {
    return withPlanImportModule((mod) => mod.clearPendingPlanImports(...args));
}
async function confirmBulkPlanImport(...args) {
    return withPlanImportModule((mod) => mod.confirmBulkPlanImport(...args));
}
async function handleBulkPlanDrop(event) {
    // Sync before any await: DataTransfer files are not durable across the chunk boundary.
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    const zone = document.getElementById("plan-import-dropzone");
    if (zone) zone.style.borderColor = "var(--panel-border)";
    const files = Array.from(event?.dataTransfer?.files || []);
    return withPlanImportModule((mod) => mod.handleBulkPlanFiles(files));
}
async function handleBulkPlanFileInput(event) {
    // Sync snapshot + clear so the same path can be re-chosen after a chunk-load failure.
    const input = event?.target || null;
    const files = Array.from(input?.files || []);
    if (input) input.value = "";
    return withPlanImportModule((mod) => mod.handleBulkPlanFiles(files));
}
async function removePendingImport(...args) {
    return withPlanImportModule((mod) => mod.removePendingImport(...args));
}
async function updatePendingImportDriver(...args) {
    return withPlanImportModule((mod) => mod.updatePendingImportDriver(...args));
}
async function updatePendingImportMonth(...args) {
    return withPlanImportModule((mod) => mod.updatePendingImportMonth(...args));
}

/**
 * Lazy Dispo messages chunk (H1-A / D17) — msg-compose + co-lazy sent-messages.
 * Rejected loads are not permanently cached; module errors after load must propagate.
 */
async function withMsgComposeModule(run) {
    let mod;
    try {
        mod = await loadMsgCompose();
    } catch {
        showToast(t("msg_compose_chunk_load_failed"), "error", 8000);
        return undefined;
    }
    try {
        return await run(mod);
    } catch (err) {
        console.error("msg-compose execution failed", err);
        showToast(t("error_generic"), "error", 8000);
        return undefined;
    }
}

async function withSentMessagesModule(run) {
    try {
        await loadMsgCompose();
    } catch {
        showToast(t("msg_compose_chunk_load_failed"), "error", 8000);
        return undefined;
    }
    try {
        const mod = await import("./dispatcher/sent-messages.js");
        return await run(mod);
    } catch (err) {
        console.error("sent-messages execution failed", err);
        showToast(t("error_generic"), "error", 8000);
        return undefined;
    }
}

async function setMessagesPageTab(...args) {
    return withMsgComposeModule((mod) => mod.setMessagesPageTab(...args));
}
async function submitDispatcherMessage(...args) {
    return withMsgComposeModule((mod) => mod.submitDispatcherMessage(...args));
}
async function archiveDispatcherMessage(...args) {
    return withSentMessagesModule((mod) => mod.archiveDispatcherMessage(...args));
}
async function archiveAllDispatcherMessages(...args) {
    return withSentMessagesModule((mod) => mod.archiveAllDispatcherMessages(...args));
}

/** Prefetch plan-import when entering monthly plan so CTA first click is warm. */
function openMonthlyPlansFull(...args) {
    prefetchPlanImport();
    return openMonthlyPlansFullCore(...args);
}
function openMonthlyPlanForGroup(...args) {
    prefetchPlanImport();
    return openMonthlyPlanForGroupCore(...args);
}
function openMonthlyPlanImport(...args) {
    prefetchPlanImport();
    return openMonthlyPlanImportCore(...args);
}

async function caWizardBack(...args) {
    const mod = await loadCompanyAdminOnboarding();
    return mod.caWizardBack(...args);
}
async function caWizardNext(...args) {
    const mod = await loadCompanyAdminOnboarding();
    return mod.caWizardNext(...args);
}
async function caWizardSelectColor(...args) {
    const mod = await loadCompanyAdminOnboarding();
    return mod.caWizardSelectColor(...args);
}
async function caWizardSelectColorFromHex(...args) {
    const mod = await loadCompanyAdminOnboarding();
    return mod.caWizardSelectColorFromHex(...args);
}
async function caWizardSelectColorFromPicker(...args) {
    const mod = await loadCompanyAdminOnboarding();
    return mod.caWizardSelectColorFromPicker(...args);
}
async function caWizardHandleLogo(...args) {
    const mod = await loadCompanyAdminOnboarding();
    return mod.caWizardHandleLogo(...args);
}
async function caWizardSkip(...args) {
    const mod = await loadCompanyAdminOnboarding();
    return mod.caWizardSkip(...args);
}

async function openDispatcherHelp(...args) {
    const mod = await loadDispatcherHelp();
    return mod.openDispatcherHelp(...args);
}

function closeDispatcherHelp() {
    closeModal("dispatcher-help-modal");
    return true;
}

async function dispatcherHelpSoftReload(...args) {
    const mod = await loadDispatcherHelp();
    return mod.dispatcherHelpSoftReload(...args);
}

async function dispatcherHelpLogout(...args) {
    const mod = await loadDispatcherHelp();
    return mod.dispatcherHelpLogout(...args);
}

async function dispatcherHelpCopyEmail(...args) {
    const mod = await loadDispatcherHelp();
    return mod.dispatcherHelpCopyEmail(...args);
}

async function dispatcherHelpOpenMailto(...args) {
    const mod = await loadDispatcherHelp();
    return mod.dispatcherHelpOpenMailto(...args);
}

async function fillHelpModal(...args) {
    const mod = await loadDispatcherHelp();
    return mod.fillHelpModal(...args);
}

const HANDLERS = {
    addBus,
    toggleBusEdit,
    saveBusOpsProfile,
    quickSetBusStatus,
    changeBusGroup,
    clearBusImportPreview,
    confirmBusImport,
    handleBusImportDrop,
    handleBusImportFile,
    handleBusImportPaste,
    addCompanyDispatcher,
    addDriver,
    applyBrandingSettings,
    archiveAllDispatcherMessages,
    archiveDispatcherMessage,
    assignShift,
    backFromPlanFullPage,
    caWizardBack,
    caWizardNext,
    caWizardSelectColor,
    caWizardSelectColorFromHex,
    caWizardSelectColorFromPicker,
    caWizardHandleLogo,
    caWizardSkip,
    cancelCompanyGroupEdit,
    changeCalendarMonth,
    changeCompanyDriversPage,
    changeLanguage,
    clearCompanyBrandingLogo,
    handleCompanyBrandingLogoFile,
    clearCompanyDriversImport,
    clearCompanyServicePlanPreview,
    clearPackageImport,
    clearPendingPlanImports,
    clearScheduleFile,
    clearScheduleText,
    clickElementById,
    closeCompanyDriverAddModal,
    closeCompanyDriverEdit,
    closeCompanyServicePlanDuty,
    closeCompanyServicePlanHistory,
    closeConfirmModal,
    closeDispatcherHelp,
    closeGroupHub,
    closeModal,
    closeMonthlyDayEditModal,
    closeOperationalIncident,
    closeCoverageResolver,
    closeReportResolution,
    closeSosConfirmModal,
    closeSuperAdminModal,
    confirmBulkPlanImport,
    confirmClearSOS,
    confirmCompanyDriversImport,
    submitCompanyDriverManualAdd,
    confirmFactoryReset,
    confirmModalYes,
    confirmPackageImport,
    confirmResolveSOS,
    confirmSuperAdminPin,
    createDispatcherGroup,
    createEmptyMonthlyPlan,
    exportMonthlyGroupPlanCsv,
    deleteMonthlyPlan,
    clearDailyShift,
    async detachDriverFromLine(...args) {
        const mod = await import("./dispatcher/line-roster.js");
        return mod.detachDriverFromLine(...args);
    },
    async detachBusFromLine(...args) {
        const mod = await import("./dispatcher/line-roster.js");
        return mod.detachBusFromLine(...args);
    },
    deleteBus,
    deleteCompanyGroup,
    deleteGroup,
    deleteRoute,
    deleteScheduleEntry,
    editDriver,
    dispatcherHelpCopyEmail,
    dispatcherHelpLogout,
    dispatcherHelpOpenMailto,
    dispatcherHelpSoftReload,
    endCompanySupportSession,
    openCompanyOpsOverview,
    enterDispatcherActiveGroup,
    exitImpersonation,
    exportDriversCSV,
    exportLostItemsCSV,
    exportReportsCSV,
    fillHelpModal,
    focusCompanyDispatcherForm,
    focusCompanyGroupForm,
    forgotDispatcherPassword,
    formatScheduleText,
    getScheduleByKey,
    handleBulkPlanDrop,
    handleBulkPlanFileInput,
    handleCompanyAuditFilters,
    handleCompanyDriversFile,
    handleCompanyDriversFilter,
    handleCompanyDriversSearch,
    handleCompanyServicePlanFile,
    handleCompanyServicePlanGroupChange,
    handleCompanySettingsCountry,
    handleCompanySettingsInput,
    handleLogoClick,
    handlePackageImportDrop,
    handlePackageImportInput,
    handleScheduleDrop,
    handleScheduleFileSelect,
    handleVacation,
    insertScheduleTable,
    loadMonthlyPlanForDriver,
    focusMonthlyDriverPlan,
    loadMoreCompanyAudit,
    loginAsDispatcher,
    logout,
    onMedCatalogSelectChange,
    onMedDaySelectChange,
    onMedShiftTypeChange,
    openCompanyDriverAddModal,
    openCompanyDriverEdit,
    openMonthlyPlanImport,
    openCompanyServicePlanDuty,
    openCompanyServicePlanHistory,
    openDailyPlanForGroup,
    openDailyPlanFull,
    openDispatcherHelp,
    openGroupHub,
    openVehiclesForGroup,
    openVehiclesFromPlan,
    openOpsPlanHealthProblems: goToOpsPlanProblems,
    openMonthlyDayEdit,
    openMonthlyDayEditForDriver,
    previewMonthlyMassAbsence,
    openOperationalIncident,
    openVehicleOperationalIncident,
    transitionOperationalIncident,
    openCoverageResolver,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
    focusOpsAttentionItem,
    applyOpsAttentionFix,
    openReportResolution,
    openMonthlyPlanForGroup,
    openMonthlyPlansFull,
    openShiftCell,
    persistShift,
    dailyPlanAssignDriver,
    acquirePlanEditLock,
    releasePlanEditLock,
    breakPlanEditLock,
    confirmBreakPlanEditLock,
    refreshPlanLockBanner,
    opsAssignDriver,
    publishCompanyServicePlan,
    activateCompanyServicePlanVersion,
    refreshCompanyAudit,
    removeDispatcher,
    removeElementById,
    removePendingImport,
    removeShift,
    resetCompanyAuditFilters,
    resetCompanyDispatcherPassword,
    resetCompanySettingsForm,
    resolveReport,
    resolveSOS,
    returnLostItem,
    setLostItemStatus,
    openLostItemPhoto,
    revokeCompanyDispatcherSessions,
    saveCompanyDispatcherGroups,
    saveCompanyDispatcherProfile,
    saveCompanyDriverEdit,
    saveCompanyGroup,
    saveCompanyProfileSettings,
    saveMonthlyDayEdit,
    undoMonthlyDayEdit,
    saveNewDispatcherPassword,
    scrollHubSection,
    selectMonthlyPlanGroup,
    sendScheduleToDrivers,
    setGroupFilter,
    setMessagesPageTab,
    shiftWeekNav,
    showModal,
    startEditCompanyGroup,
    submitDispatcherMessage,
    superadminOpenCreateModal,
    superadminCloseCreateModal,
    superadminSubmitCreateModal,
    superadminCreateCompany,
    superadminCreateCompanyAdmin,
    superadminDeleteCompany,
    superadminCancelDeleteCompanyModal,
    superadminConfirmDeleteCompany,
    superadminDeleteCompanyAdmin,
    superadminFocusCompanies,
    superadminCopyCompanyId,
    superadminCopyText,
    superadminImpersonate,
    superadminOpenCompany,
    superadminOpenCompanyDetail,
    superadminCloseCompanyDetail,
    superadminOpenCreateMissingAdmin,
    superadminSubmitCreateMissingAdmin,
    superadminCancelCreateMissingAdmin,
    superadminSetCompanyAdminStatus,
    superadminResetCompanyAdminPassword,
    superadminResetPin,
    superadminToggleStatus,
    superadminStartSupport,
    superadminCancelSupportModal,
    superadminConfirmSupportStart,
    superadminEndSupport,
    superadminSaveCompanySettings,
    superadminOnPlanChange,
    superadminSaveDemoCompanyProfile,
    switchScheduleTab,
    switchSection,
    switchToGroupSetup,
    t,
    toggleCaDispGroupsEdit,
    toggleCaDispProfileEdit,
    toggleCompanyDispatcherStatus,
    toggleRowActionsMenu,
    removeCompanyDispatcher,
    toggleCompanyDriverStatus,
    toggleDriverActive,
    toggleTheme,
    updateDriverBusInline,
    updateDriverShiftInline,
    updatePendingImportDriver,
    updatePendingImportMonth,
    uploadDriverSchedule,
    viewDamagePhoto,
    viewUploadedSchedule,
    wizardAddDriverRow,
    wizardBack,
    wizardHandleLogo,
    wizardNext,
    wizardSelectColor,
    wizardSkip
};

export function registerOnclickHandlers(win = window) {
    for (const [name, fn] of Object.entries(HANDLERS)) {
        if (typeof fn === "function") {
            win[name] = (...args) => (canInvokeActionDuringDriverActivation(name) ? fn(...args) : false);
        }
    }
    installActionDelegates(HANDLERS, document);
}
