// AUTO-GENERATED — node scripts/generate-register-onclick.js
// onclick/onchange handleri + data-action delegacija (v30)

import { addCompanyGroup, deleteCompanyGroup } from "./admin/company-admin-groups.js";
import { caWizardBack, caWizardNext, caWizardSelectColor, caWizardSkip } from "./admin/company-admin-onboarding.js";
import { addCompanyDispatcher, removeCompanyDispatcher, resetCompanyDispatcherPassword, saveCompanyDispatcherGroups, toggleCaDispGroupsEdit } from "./admin/company-admin-team.js";
import { createDispatcherGroup, enterDispatcherActiveGroup, exitImpersonation, saveNewDispatcherPassword, switchToGroupSetup } from "./admin/dispatcher-setup.js";
import { superadminCreateCompany, superadminCreateCompanyAdmin, superadminDeleteCompany, superadminDeleteCompanyAdmin, superadminImpersonate, superadminOpenCompany, superadminResetPin, superadminToggleStatus } from "./admin/superadmin.js";
import { forgotDispatcherPassword, loginAsDispatcher, logout } from "./auth/login-dispatcher.js";
import { loginAsDriver } from "./auth/login-driver.js";
import { switchLoginTab } from "./auth/login-ui.js";
import { closeSuperAdminModal, confirmSuperAdminPin, handleLogoClick } from "./auth/superadmin.js";
import { clickElementById, installActionDelegates, removeElementById } from "./core/action-delegate.js";
import { exportDriversCSV, exportLostItemsCSV, exportReportsCSV } from "./core/export-csv.js";
import { getScheduleByKey } from "./core/utils.js";
import { addBus, deleteBus, deleteRoute } from "./data/buses-routes.js";
import { addDriver, deleteDriver, editDriver, importDriversBulk, importDriversFromFile } from "./data/drivers.js";
import { deleteGroup, setGroupFilter } from "./data/groups.js";
import { clearScheduleFile, clearScheduleText, deleteScheduleEntry, formatScheduleText, handleScheduleDrop, handleScheduleFileSelect, insertScheduleTable, sendScheduleToDrivers, switchScheduleTab } from "./data/schedules.js";
import { loadBlaguss310TestSeed } from "./demo/blaguss-310-seed.js";
import { updateDriverBusInline, updateDriverShiftInline } from "./dispatcher/dashboard.js";
import { removeDispatcher } from "./dispatcher/dispatchers.js";
import { backFromPlanFullPage, closeGroupHub, openDailyPlanFull, openGroupHub, openMonthlyPlansFull, scrollHubSection } from "./dispatcher/group-hub.js";
import { returnLostItem } from "./dispatcher/lost-items.js";
import { closeMonthlyDayEditModal, createEmptyMonthlyPlan, loadMonthlyPlanForDriver, onMedCatalogSelectChange, onMedDaySelectChange, onMedShiftTypeChange, openMonthlyDayEdit, saveMonthlyDayEdit, selectMonthlyPlanGroup } from "./dispatcher/monthly-plans.js";
import { setMessagesPageTab, submitDispatcherMessage } from "./dispatcher/msg-compose.js";
import { clearPendingPlanImports, confirmBulkPlanImport, handleBulkPlanDrop, handleBulkPlanFileInput, removePendingImport, updatePendingImportDriver, updatePendingImportMonth } from "./dispatcher/plan-import.js";
import { deleteReport, resolveReport } from "./dispatcher/reports.js";
import { archiveAllDispatcherMessages, archiveDispatcherMessage } from "./dispatcher/sent-messages.js";
import { shiftWeekNav } from "./dispatcher/shift-utils.js";
import { assignShift, openShiftCell, removeShift } from "./dispatcher/shifts.js";
import { handleVacation } from "./dispatcher/vacations.js";
import { handleAvatarUpload, triggerAvatarUpload } from "./driver/avatar.js";
import { confirmTomorrowShift } from "./driver/calendar.js";
import { closeSosTriggerModal, confirmSOSTrigger, resolveSOS, triggerSOSAlert } from "./driver/dashboard.js";
import { confirmMessageRead } from "./driver/message-alerts.js";
import { markMessageAsRead } from "./driver/messages-inbox.js";
import { sendQuickReport } from "./driver/quick-reports.js";
import { submitBreakdownReport, submitDelayReport, submitLostItem, submitVacationRequest } from "./driver/reports.js";
import { wizardAddDriverRow, wizardBack, wizardHandleLogo, wizardNext, wizardSelectColor, wizardSkip } from "./features/onboarding.js";
import { changeCalendarMonth } from "./features/print-calendar.js";
import { clearBlagussPackageImport, confirmBlagussPackageImport, handleBlagussPackageDrop, handleBlagussPackageInput } from "./imports/blaguss-package-import.js";
import { fpNavSwitch } from "./layout/mobile-nav.js";
import { switchSection } from "./layout/navigation.js";
import { submitPreTripCheck } from "./layout/pretrip.js";
import { toggleRoleDirectly } from "./layout/role-switch.js";
import { viewDamagePhoto } from "./maps/damage-photo.js";
import { uploadDriverSchedule } from "./maps/schedule-upload.js";
import { viewUploadedSchedule } from "./maps/schedule-viewer.js";
import { closeConfirmModal, confirmModalYes } from "./ui/confirm-modal.js";
import { applyBrandingSettings, changeLanguage, t } from "./ui/i18n.js";
import { closeModal, closeSosConfirmModal, confirmClearSOS, confirmFactoryReset, confirmResolveSOS, resetApp, showModal } from "./ui/modals.js";
import { toggleTheme } from "./ui/theme.js";

const __ONCLICK_HANDLERS = {
    addBus,
    addCompanyDispatcher,
    addCompanyGroup,
    addDriver,
    applyBrandingSettings,
    archiveAllDispatcherMessages,
    archiveDispatcherMessage,
    assignShift,
    backFromPlanFullPage,
    caWizardBack,
    caWizardNext,
    caWizardSelectColor,
    caWizardSkip,
    changeCalendarMonth,
    changeLanguage,
    clearBlagussPackageImport,
    clearPendingPlanImports,
    clearScheduleFile,
    clearScheduleText,
    clickElementById,
    closeConfirmModal,
    closeGroupHub,
    closeModal,
    closeMonthlyDayEditModal,
    closeSosConfirmModal,
    closeSosTriggerModal,
    closeSuperAdminModal,
    confirmBlagussPackageImport,
    confirmBulkPlanImport,
    confirmClearSOS,
    confirmFactoryReset,
    confirmMessageRead,
    confirmModalYes,
    confirmResolveSOS,
    confirmSOSTrigger,
    confirmSuperAdminPin,
    confirmTomorrowShift,
    createDispatcherGroup,
    createEmptyMonthlyPlan,
    deleteBus,
    deleteCompanyGroup,
    deleteDriver,
    deleteGroup,
    deleteReport,
    deleteRoute,
    deleteScheduleEntry,
    editDriver,
    enterDispatcherActiveGroup,
    exitImpersonation,
    exportDriversCSV,
    exportLostItemsCSV,
    exportReportsCSV,
    forgotDispatcherPassword,
    formatScheduleText,
    fpNavSwitch,
    getScheduleByKey,
    handleAvatarUpload,
    handleBlagussPackageDrop,
    handleBlagussPackageInput,
    handleBulkPlanDrop,
    handleBulkPlanFileInput,
    handleLogoClick,
    handleScheduleDrop,
    handleScheduleFileSelect,
    handleVacation,
    importDriversBulk,
    importDriversFromFile,
    insertScheduleTable,
    loadBlaguss310TestSeed,
    loadMonthlyPlanForDriver,
    loginAsDispatcher,
    loginAsDriver,
    logout,
    markMessageAsRead,
    onMedCatalogSelectChange,
    onMedDaySelectChange,
    onMedShiftTypeChange,
    openDailyPlanFull,
    openGroupHub,
    openMonthlyDayEdit,
    openMonthlyPlansFull,
    openShiftCell,
    removeCompanyDispatcher,
    removeDispatcher,
    removeElementById,
    removePendingImport,
    removeShift,
    resetApp,
    resetCompanyDispatcherPassword,
    resolveReport,
    resolveSOS,
    returnLostItem,
    saveCompanyDispatcherGroups,
    saveMonthlyDayEdit,
    saveNewDispatcherPassword,
    scrollHubSection,
    selectMonthlyPlanGroup,
    sendQuickReport,
    sendScheduleToDrivers,
    setGroupFilter,
    setMessagesPageTab,
    shiftWeekNav,
    showModal,
    submitBreakdownReport,
    submitDelayReport,
    submitDispatcherMessage,
    submitLostItem,
    submitPreTripCheck,
    submitVacationRequest,
    superadminCreateCompany,
    superadminCreateCompanyAdmin,
    superadminDeleteCompany,
    superadminDeleteCompanyAdmin,
    superadminImpersonate,
    superadminOpenCompany,
    superadminResetPin,
    superadminToggleStatus,
    switchLoginTab,
    switchScheduleTab,
    switchSection,
    switchToGroupSetup,
    t,
    toggleCaDispGroupsEdit,
    toggleRoleDirectly,
    toggleTheme,
    triggerAvatarUpload,
    triggerSOSAlert,
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
        if (typeof fn === "function") win[name] = fn;
    }
    installActionDelegates(__ONCLICK_HANDLERS, document);
}
