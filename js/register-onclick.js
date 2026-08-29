// AUTO-GENERATED — node scripts/generate-register-onclick.js
// onclick/onchange handleri + data-action delegacija (v30)

import { handleCompanyAuditFilters, loadMoreCompanyAudit, refreshCompanyAudit, resetCompanyAuditFilters } from "./admin/company-admin-audit.js";
import { applyBrandingSettings, clearCompanyBrandingLogo } from "./admin/company-admin-branding.js";
import { changeCompanyDriversPage, clearCompanyDriversImport, closeCompanyDriverEdit, confirmCompanyDriversImport, handleCompanyDriversFile, handleCompanyDriversFilter, handleCompanyDriversSearch, openCompanyDriverEdit, saveCompanyDriverEdit, toggleCompanyDriverStatus } from "./admin/company-admin-drivers.js";
import { cancelCompanyGroupEdit, deleteCompanyGroup, focusCompanyGroupForm, saveCompanyGroup, startEditCompanyGroup } from "./admin/company-admin-groups.js";
import { caWizardBack, caWizardNext, caWizardSelectColor, caWizardSkip } from "./admin/company-admin-onboarding.js";
import { clearCompanyServicePlanPreview, closeCompanyServicePlanDuty, closeCompanyServicePlanHistory, handleCompanyServicePlanFile, handleCompanyServicePlanGroupChange, openCompanyServicePlanDuty, openCompanyServicePlanHistory, publishCompanyServicePlan, activateCompanyServicePlanVersion } from "./admin/company-admin-service-plan.js";
import { handleCompanySettingsCountry, handleCompanySettingsInput, resetCompanySettingsForm, saveCompanyProfileSettings, handleEmailSmtpInput, resetEmailSmtpForm, saveEmailSmtpSettings } from "./admin/company-admin-settings.js";
import { addCompanyDispatcher, focusCompanyDispatcherForm, resetCompanyDispatcherPassword, revokeCompanyDispatcherSessions, saveCompanyDispatcherGroups, toggleCaDispGroupsEdit, toggleCompanyDispatcherStatus } from "./admin/company-admin-team.js";
import { createDispatcherGroup, enterDispatcherActiveGroup, exitImpersonation, saveNewDispatcherPassword, switchToGroupSetup } from "./admin/dispatcher-setup.js";
import { superadminCreateCompany, superadminCreateCompanyAdmin, superadminDeleteCompany, superadminCancelDeleteCompanyModal, superadminConfirmDeleteCompany, superadminDeleteCompanyAdmin, superadminFocusCompanies, superadminCopyCompanyId, superadminCopyText, superadminImpersonate, superadminOpenCompany, superadminOpenCompanyDetail, superadminCloseCompanyDetail, superadminSetCompanyAdminStatus, superadminResetCompanyAdminPassword, superadminResetPin, superadminToggleStatus } from "./admin/superadmin.js";
import { cancelDriverActivation, openDriverActivation, submitDriverActivation } from "./auth/driver-activation.js";
import { forgotDispatcherPassword, loginAsDispatcher, logout } from "./auth/login-dispatcher.js";
import { loginAsDriver } from "./auth/login-driver.js";
import { switchLoginTab } from "./auth/login-ui.js";
import { closeSuperAdminModal, confirmSuperAdminPin, handleLogoClick } from "./auth/superadmin.js";
import { clickElementById, installActionDelegates, removeElementById } from "./core/action-delegate.js";
import { exportDriversCSV, exportLostItemsCSV, exportReportsCSV } from "./core/export-csv.js";
import { getScheduleByKey } from "./core/utils.js";
import { addBus, deleteBus, deleteRoute, toggleBusEdit, saveBusOpsProfile, quickSetBusStatus, changeBusGroup, toggleShowArchivedBuses } from "./data/buses-routes.js";
import { addDriver, editDriver, toggleDriverActive, toggleDriverKG } from "./data/drivers.js";
import { deleteGroup, setGroupFilter } from "./data/groups.js";
import { clearScheduleFile, clearScheduleText, deleteScheduleEntry, formatScheduleText, handleScheduleDrop, handleScheduleFileSelect, insertScheduleTable, sendScheduleToDrivers, switchScheduleTab } from "./data/schedules.js";
import { updateDriverBusInline, updateDriverShiftInline } from "./dispatcher/dashboard.js";
import { removeDispatcher } from "./dispatcher/dispatchers.js";
import { backFromPlanFullPage, closeGroupHub, openDailyPlanForGroup, openDailyPlanFull, openGroupHub, openMonthlyPlanForGroup, openMonthlyPlansFull, scrollHubSection } from "./dispatcher/group-hub.js";
import { returnLostItem, setLostItemStatus, openLostItemPhoto } from "./dispatcher/lost-items.js";
import { closeMonthlyDayEditModal, createEmptyMonthlyPlan, loadMonthlyPlanForDriver, onMedCatalogSelectChange, onMedDaySelectChange, onMedShiftTypeChange, openMonthlyDayEdit, openMonthlyDayEditForDriver, previewMonthlyMassAbsence, saveMonthlyDayEdit, selectMonthlyPlanGroup, undoMonthlyDayEdit } from "./dispatcher/monthly-plans.js";
import { setMessagesPageTab, submitDispatcherMessage } from "./dispatcher/msg-compose.js";
import { clearPendingPlanImports, confirmBulkPlanImport, handleBulkPlanDrop, handleBulkPlanFileInput, removePendingImport, updatePendingImportDriver, updatePendingImportMonth } from "./dispatcher/plan-import.js";
import { resolveReport } from "./dispatcher/reports.js";
import { archiveAllDispatcherMessages, archiveDispatcherMessage } from "./dispatcher/sent-messages.js";
import { shiftWeekNav } from "./dispatcher/shift-utils.js";
import { assignShift, closeDutyConflictModal, openConflictingDriverAssignment, openShiftCell, removeShift } from "./dispatcher/shifts.js";
import { handleVacation } from "./dispatcher/vacations.js";
import { handleAvatarUpload, triggerAvatarUpload } from "./driver/avatar.js";
import { confirmTomorrowShift } from "./driver/calendar.js";
import { resolveSOS } from "./maps/sos-siren.js";
import { callDispatcher, sendDriverSosNow } from "./driver/dashboard.js";
import { archiveMessage, archiveReadMessages, confirmMessageRead } from "./driver/message-alerts.js";
import { markMessageAsRead } from "./driver/messages-inbox.js";
import { sendQuickReport } from "./driver/quick-reports.js";
import { submitBreakdownReport, submitDelayReport, submitLostItem, submitVacationRequest } from "./driver/reports.js";
import { wizardAddDriverRow, wizardBack, wizardHandleLogo, wizardNext, wizardSelectColor, wizardSkip } from "./features/onboarding.js";
import { changeCalendarMonth } from "./features/print-calendar.js";
import { clearPackageImport, confirmPackageImport, handlePackageImportDrop, handlePackageImportInput } from "./imports/package-import.js";
import { fpNavSwitch } from "./layout/mobile-nav.js";
import { switchSection } from "./layout/navigation.js";
import { submitPreTripCheck } from "./layout/pretrip.js";
import { toggleRoleDirectly } from "./layout/role-switch.js";
import { viewDamagePhoto } from "./maps/damage-photo.js";
import { uploadDriverSchedule } from "./maps/schedule-upload.js";
import { viewUploadedSchedule } from "./maps/schedule-viewer.js";
import { closeConfirmModal, confirmModalYes } from "./ui/confirm-modal.js";
import { changeLanguage, t } from "./ui/i18n.js";
import { closeModal, closeSosConfirmModal, confirmClearSOS, confirmFactoryReset, confirmResolveSOS, showModal } from "./ui/modals.js";
import { toggleTheme } from "./ui/theme.js";
import { canInvokeActionDuringDriverActivation } from "./auth/driver-access-gate.js";

const __ONCLICK_HANDLERS = {
    addBus,
    toggleBusEdit,
    saveBusOpsProfile,
    quickSetBusStatus,
    changeBusGroup,
    toggleShowArchivedBuses,
    addCompanyDispatcher,
    addDriver,
    applyBrandingSettings,
    archiveAllDispatcherMessages,
    archiveDispatcherMessage,
    archiveMessage,
    archiveReadMessages,
    assignShift,
    backFromPlanFullPage,
    caWizardBack,
    caWizardNext,
    caWizardSelectColor,
    caWizardSkip,
    cancelCompanyGroupEdit,
    cancelDriverActivation,
    changeCalendarMonth,
    changeCompanyDriversPage,
    changeLanguage,
    clearCompanyBrandingLogo,
    clearCompanyDriversImport,
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
    closeDutyConflictModal,
    closeGroupHub,
    closeModal,
    closeMonthlyDayEditModal,
    closeSosConfirmModal,
    callDispatcher,
    closeSuperAdminModal,
    confirmBulkPlanImport,
    confirmClearSOS,
    confirmCompanyDriversImport,
    confirmFactoryReset,
    confirmMessageRead,
    confirmModalYes,
    confirmPackageImport,
    confirmResolveSOS,
    sendDriverSosNow,
    confirmSuperAdminPin,
    confirmTomorrowShift,
    createDispatcherGroup,
    createEmptyMonthlyPlan,
    deleteBus,
    deleteCompanyGroup,
    deleteGroup,
    deleteRoute,
    deleteScheduleEntry,
    editDriver,
    enterDispatcherActiveGroup,
    exitImpersonation,
    exportDriversCSV,
    exportLostItemsCSV,
    exportReportsCSV,
    focusCompanyDispatcherForm,
    focusCompanyGroupForm,
    forgotDispatcherPassword,
    formatScheduleText,
    fpNavSwitch,
    getScheduleByKey,
    handleAvatarUpload,
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
    handleEmailSmtpInput,
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
    loginAsDriver,
    logout,
    markMessageAsRead,
    onMedCatalogSelectChange,
    onMedDaySelectChange,
    onMedShiftTypeChange,
    openCompanyDriverEdit,
    openCompanyServicePlanDuty,
    openCompanyServicePlanHistory,
    openDailyPlanForGroup,
    openDailyPlanFull,
    openDriverActivation,
    openGroupHub,
    openMonthlyDayEdit,
    openMonthlyDayEditForDriver,
    previewMonthlyMassAbsence,
    openMonthlyPlanForGroup,
    openMonthlyPlansFull,
    openShiftCell,
    openConflictingDriverAssignment,
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
    resetEmailSmtpForm,
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
    saveEmailSmtpSettings,
    saveMonthlyDayEdit,
    undoMonthlyDayEdit,
    saveNewDispatcherPassword,
    scrollHubSection,
    selectMonthlyPlanGroup,
    sendQuickReport,
    sendScheduleToDrivers,
    setGroupFilter,
    setMessagesPageTab,
    shiftWeekNav,
    showModal,
    startEditCompanyGroup,
    submitBreakdownReport,
    submitDelayReport,
    submitDispatcherMessage,
    submitDriverActivation,
    submitLostItem,
    submitPreTripCheck,
    submitVacationRequest,
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
    switchLoginTab,
    switchScheduleTab,
    switchSection,
    switchToGroupSetup,
    t,
    toggleCaDispGroupsEdit,
    toggleCompanyDispatcherStatus,
    toggleCompanyDriverStatus,
    toggleDriverActive,
    toggleDriverKG,
    toggleRoleDirectly,
    toggleTheme,
    triggerAvatarUpload,
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
    for (const [name, fn] of Object.entries(__ONCLICK_HANDLERS)) {
        if (typeof fn === "function") {
            win[name] = (...args) => canInvokeActionDuringDriverActivation(name) ? fn(...args) : false;
        }
    }
    installActionDelegates(__ONCLICK_HANDLERS, document);
}
