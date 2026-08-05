// BusCommand — staff surface action handlers
import { handleCompanyAuditFilters, loadMoreCompanyAudit, refreshCompanyAudit, resetCompanyAuditFilters } from "./admin/company-admin-audit.js";
import { applyBrandingSettings, clearCompanyBrandingLogo, handleCompanyBrandingLogoFile } from "./admin/company-admin-branding.js";
import { changeCompanyDriversPage, clearCompanyDriversImport, closeCompanyDriverEdit, confirmCompanyDriversImport, handleCompanyDriversFile, handleCompanyDriversFilter, handleCompanyDriversSearch, openCompanyDriverEdit, saveCompanyDriverEdit, toggleCompanyDriverStatus } from "./admin/company-admin-drivers.js";
import { cancelCompanyGroupEdit, deleteCompanyGroup, focusCompanyGroupForm, saveCompanyGroup, startEditCompanyGroup } from "./admin/company-admin-groups.js";
import { caWizardBack, caWizardNext, caWizardSelectColor, caWizardSelectColorFromHex, caWizardSelectColorFromPicker, caWizardHandleLogo, caWizardSkip } from "./admin/company-admin-onboarding.js";
import { clearCompanyServicePlanPreview, closeCompanyServicePlanDuty, closeCompanyServicePlanHistory, handleCompanyServicePlanFile, handleCompanyServicePlanGroupChange, openCompanyServicePlanDuty, openCompanyServicePlanHistory, publishCompanyServicePlan, activateCompanyServicePlanVersion } from "./admin/company-admin-service-plan.js";
import { clearCompanyGroupMonthlyImport, commitCompanyGroupMonthlyImport, handleCompanyGroupMonthlyFile, invalidateCompanyGroupMonthlyPreview, previewCompanyGroupMonthlyImport } from "./admin/company-admin-monthly-import.js";
import { handleCompanySettingsCountry, handleCompanySettingsInput, resetCompanySettingsForm, saveCompanyProfileSettings } from "./admin/company-admin-settings.js";
import { addCompanyDispatcher, focusCompanyDispatcherForm, removeCompanyDispatcher, resetCompanyDispatcherPassword, revokeCompanyDispatcherSessions, saveCompanyDispatcherGroups, toggleCaDispGroupsEdit, toggleCompanyDispatcherStatus } from "./admin/company-admin-team.js";
import { endCompanySupportSession, openCompanyOpsOverview } from "./admin/company-admin.js";
import { createDispatcherGroup, enterDispatcherActiveGroup, exitImpersonation, saveNewDispatcherPassword, switchToGroupSetup } from "./admin/dispatcher-setup.js";
import { superadminCreateCompany, superadminCreateCompanyAdmin, superadminDeleteCompany, superadminCancelDeleteCompanyModal, superadminConfirmDeleteCompany, superadminDeleteCompanyAdmin, superadminFocusCompanies, superadminCopyCompanyId, superadminCopyText, superadminImpersonate, superadminOpenCompany, superadminOpenCompanyDetail, superadminCloseCompanyDetail, superadminSetCompanyAdminStatus, superadminResetCompanyAdminPassword, superadminResetPin, superadminToggleStatus, superadminStartSupport, superadminCancelSupportModal, superadminConfirmSupportStart, superadminEndSupport, superadminSaveCompanySettings } from "./admin/superadmin.js";
import { forgotDispatcherPassword, loginAsDispatcher, logout } from "./auth/login-dispatcher.js";
import { closeSuperAdminModal, confirmSuperAdminPin, handleLogoClick } from "./auth/superadmin.js";
import { clickElementById, installActionDelegates, removeElementById } from "./core/action-delegate.js";
import { exportDriversCSV, exportLostItemsCSV, exportReportsCSV } from "./core/export-csv.js";
import { getScheduleByKey } from "./core/utils.js";
import { addBus, deleteBus, deleteRoute } from "./data/buses-routes.js";
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
    applyOpsAttentionFix
} from "./dispatcher/dashboard.js";
import { removeDispatcher } from "./dispatcher/dispatchers.js";
import { backFromPlanFullPage, closeGroupHub, openDailyPlanForGroup, openDailyPlanFull, openGroupHub, openMonthlyPlanForGroup, openMonthlyPlansFull, scrollHubSection } from "./dispatcher/group-hub.js";
import { returnLostItem, setLostItemStatus, openLostItemPhoto } from "./dispatcher/lost-items.js";
import { closeMonthlyDayEditModal, createEmptyMonthlyPlan, loadMonthlyPlanForDriver, onMedCatalogSelectChange, onMedDaySelectChange, onMedShiftTypeChange, openMonthlyDayEdit, openMonthlyDayEditForDriver, previewMonthlyMassAbsence, saveMonthlyDayEdit, selectMonthlyPlanGroup, undoMonthlyDayEdit } from "./dispatcher/monthly-plans.js";
import { setMessagesPageTab, submitDispatcherMessage } from "./dispatcher/msg-compose.js";
import { clearPendingPlanImports, confirmBulkPlanImport, handleBulkPlanDrop, handleBulkPlanFileInput, removePendingImport, updatePendingImportDriver, updatePendingImportMonth } from "./dispatcher/plan-import.js";
import { resolveReport, openReportResolution, closeReportResolution } from "./dispatcher/reports.js";
import { archiveAllDispatcherMessages, archiveDispatcherMessage } from "./dispatcher/sent-messages.js";
import { shiftWeekNav } from "./dispatcher/shift-utils.js";
import { assignShift, openShiftCell, persistShift, removeShift } from "./dispatcher/shifts.js";
import { dailyPlanAssignDriver } from "./dispatcher/daily-plan.js";
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
import { toggleTheme } from "./ui/theme.js";
import { canInvokeActionDuringDriverActivation } from "./auth/driver-access-gate.js";

const HANDLERS = {
    addBus,
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
    clearCompanyGroupMonthlyImport,
    clearCompanyServicePlanPreview,
    clearPackageImport,
    clearPendingPlanImports,
    clearScheduleFile,
    clearScheduleText,
    clickElementById,
    closeCompanyDriverEdit,
    closeCompanyServicePlanDuty,
    closeCompanyServicePlanHistory,
    closeConfirmModal,
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
    confirmFactoryReset,
    confirmModalYes,
    confirmPackageImport,
    confirmResolveSOS,
    confirmSuperAdminPin,
    createDispatcherGroup,
    createEmptyMonthlyPlan,
    deleteBus,
    deleteCompanyGroup,
    deleteGroup,
    deleteRoute,
    deleteScheduleEntry,
    editDriver,
    endCompanySupportSession,
    openCompanyOpsOverview,
    enterDispatcherActiveGroup,
    exitImpersonation,
    exportDriversCSV,
    exportLostItemsCSV,
    exportReportsCSV,
    focusCompanyDispatcherForm,
    focusCompanyGroupForm,
    forgotDispatcherPassword,
    formatScheduleText,
    getScheduleByKey,
    handleBulkPlanDrop,
    handleBulkPlanFileInput,
    handleCompanyAuditFilters,
    handleCompanyDriversFile,
    handleCompanyGroupMonthlyFile,
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
    loadMoreCompanyAudit,
    loginAsDispatcher,
    logout,
    onMedCatalogSelectChange,
    onMedDaySelectChange,
    onMedShiftTypeChange,
    openCompanyDriverEdit,
    openCompanyServicePlanDuty,
    openCompanyServicePlanHistory,
    openDailyPlanForGroup,
    openDailyPlanFull,
    openGroupHub,
    openMonthlyDayEdit,
    openMonthlyDayEditForDriver,
    previewMonthlyMassAbsence,
    openOperationalIncident,
    openVehicleOperationalIncident,
    transitionOperationalIncident,
    openCoverageResolver,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
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
    previewCompanyGroupMonthlyImport,
    commitCompanyGroupMonthlyImport,
    invalidateCompanyGroupMonthlyPreview,
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
    superadminSetCompanyAdminStatus,
    superadminResetCompanyAdminPassword,
    superadminResetPin,
    superadminToggleStatus,
    superadminStartSupport,
    superadminCancelSupportModal,
    superadminConfirmSupportStart,
    superadminEndSupport,
    superadminSaveCompanySettings,
    switchScheduleTab,
    switchSection,
    switchToGroupSetup,
    t,
    toggleCaDispGroupsEdit,
    toggleCompanyDispatcherStatus,
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
