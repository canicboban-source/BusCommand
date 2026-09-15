// BusCommand — Dispatcher onclick handlers (role graph)
import { showToast } from "./core/utils.js";
import { loadPlanImport, prefetchPlanImport } from "./dispatcher/plan-import-loader.js";
import { loadMsgCompose } from "./dispatcher/msg-compose-loader.js";
import { addBus, deleteBus, deleteRoute, toggleBusEdit, saveBusOpsProfile, quickSetBusStatus, changeBusGroup, toggleShowArchivedBuses } from "./data/buses-routes.js";
import {
    clearBusImportPreview,
    confirmBusImport,
    handleBusImportDrop,
    handleBusImportFile,
    handleBusImportPaste
} from "./data/bus-import.js";
import { addDriver, editDriver, toggleDriverActive, toggleDriverKG } from "./data/drivers.js";
import { deleteGroup, setGroupFilter } from "./data/groups.js";
import { clearScheduleFile, clearScheduleText, deleteScheduleEntry, formatScheduleText, handleScheduleDrop, handleScheduleFileSelect, insertScheduleTable, sendScheduleToDrivers, switchScheduleTab } from "./data/schedules.js";
import { getScheduleByKey } from "./core/utils.js";
import { exportDriversCSV, exportLostItemsCSV, exportReportsCSV } from "./core/export-csv.js";
import {
    updateDriverBusInline,
    updateDriverShiftInline,
    opsAssignDriver,
    openOperationalIncident,
    openVehicleOperationalIncident,
    closeOperationalIncident,
    openCoverageResolver,
    closeCoverageResolver,
    resolveModalCoverageAvailableAgain,
    resolveCoverageAvailableAgainFromCard,
    transitionOperationalIncident,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
    focusOpsAttentionItem,
    applyOpsAttentionFix,
    refreshOpsCenterNow
} from "./dispatcher/dashboard.js";
import { removeDispatcher } from "./dispatcher/dispatchers.js";
import { backFromPlanFullPage, closeGroupHub, openDailyPlanForGroup, openDailyPlanFull, openGroupHub, openMonthlyPlanForGroup as openMonthlyPlanForGroupCore, openMonthlyPlanImport as openMonthlyPlanImportCore, openMonthlyPlansFull as openMonthlyPlansFullCore, openVehiclesFromPlan, scrollHubSection } from "./dispatcher/group-hub.js";
import { returnLostItem, setLostItemStatus, openLostItemPhoto } from "./dispatcher/lost-items.js";
import { closeMonthlyDayEditModal, createEmptyMonthlyPlan, deleteMonthlyPlan, exportMonthlyGroupPlanCsv, focusMonthlyDriverPlan, loadMonthlyPlanForDriver, onMedCatalogSelectChange, onMedDaySelectChange, onMedShiftTypeChange, openMonthlyDayEdit, openMonthlyDayEditForDriver, previewMonthlyMassAbsence, applyMatrixBulkEdit, saveMonthlyDayEdit, selectMonthlyPlanGroup, undoMonthlyDayEdit } from "./dispatcher/monthly-plans.js";
import { goToOpsPlanProblems } from "./dispatcher/plan-health-banner.js";
import { openVehiclesForGroup } from "./dispatcher/vehicles-panel.js";
import { resolveReport, openReportResolution, closeReportResolution } from "./dispatcher/reports.js";
import { shiftWeekNav } from "./dispatcher/shift-utils.js";
import { assignShift, closeDutyConflictModal, openConflictingDriverAssignment, openShiftCell, persistShift, removeShift } from "./dispatcher/shifts.js";
import { dailyPlanAssignDriver, clearDailyShift, undoDailyShift } from "./dispatcher/daily-plan.js";
import {
    acquirePlanEditLock,
    releasePlanEditLock,
    breakPlanEditLock,
    confirmBreakPlanEditLock,
    refreshPlanLockBanner
} from "./dispatcher/plan-edit-lock-ui.js";
import { handleVacation } from "./dispatcher/vacations.js";
import { changeCalendarMonth } from "./features/print-calendar.js";
import { viewDamagePhoto } from "./maps/damage-photo.js";
import { uploadDriverSchedule } from "./maps/schedule-upload.js";
import { viewUploadedSchedule } from "./maps/schedule-viewer.js";
import { closeModal } from "./ui/modals.js";
import { t } from "./ui/i18n.js";
import { mergeStaffActionHandlers } from "./staff/staff-action-handlers.js";

function loadDispatcherHelp() {
    return import("./dispatcher/help-support.js");
}

async function withPlanImportModule(run) {
    let mod;
    try {
        mod = await loadPlanImport();
    } catch {
        showToast(t("plan_import_chunk_load_failed"), "error", 8000);
        return undefined;
    }
    return run(mod);
}

async function clearPendingPlanImports(...args) {
    return withPlanImportModule((mod) => mod.clearPendingPlanImports(...args));
}
async function confirmBulkPlanImport(...args) {
    return withPlanImportModule((mod) => mod.confirmBulkPlanImport(...args));
}
async function handleBulkPlanDrop(event) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    const zone = document.getElementById("plan-import-dropzone");
    if (zone) zone.style.borderColor = "var(--panel-border)";
    const files = Array.from(event?.dataTransfer?.files || []);
    return withPlanImportModule((mod) => mod.handleBulkPlanFiles(files));
}
async function handleBulkPlanFileInput(event) {
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

const DISPATCHER_HANDLERS = {
    addBus,
    toggleBusEdit,
    saveBusOpsProfile,
    quickSetBusStatus,
    changeBusGroup,
    toggleShowArchivedBuses,
    clearBusImportPreview,
    confirmBusImport,
    handleBusImportDrop,
    handleBusImportFile,
    handleBusImportPaste,
    addDriver,
    archiveAllDispatcherMessages,
    archiveDispatcherMessage,
    assignShift,
    backFromPlanFullPage,
    changeCalendarMonth,
    clearPendingPlanImports,
    clearScheduleFile,
    clearScheduleText,
    closeDutyConflictModal,
    closeDispatcherHelp,
    closeGroupHub,
    closeMonthlyDayEditModal,
    closeOperationalIncident,
    closeCoverageResolver,
    closeReportResolution,
    confirmBulkPlanImport,
    createEmptyMonthlyPlan,
    exportMonthlyGroupPlanCsv,
    deleteMonthlyPlan,
    clearDailyShift,
    undoDailyShift,
    async detachDriverFromLine(...args) {
        const mod = await import("./dispatcher/line-roster.js");
        return mod.detachDriverFromLine(...args);
    },
    async detachBusFromLine(...args) {
        const mod = await import("./dispatcher/line-roster.js");
        return mod.detachBusFromLine(...args);
    },
    deleteBus,
    deleteGroup,
    deleteRoute,
    deleteScheduleEntry,
    editDriver,
    dispatcherHelpCopyEmail,
    dispatcherHelpLogout,
    dispatcherHelpOpenMailto,
    dispatcherHelpSoftReload,
    exportDriversCSV,
    exportLostItemsCSV,
    exportReportsCSV,
    fillHelpModal,
    formatScheduleText,
    getScheduleByKey,
    handleBulkPlanDrop,
    handleBulkPlanFileInput,
    handleScheduleDrop,
    handleScheduleFileSelect,
    handleVacation,
    insertScheduleTable,
    loadMonthlyPlanForDriver,
    focusMonthlyDriverPlan,
    onMedCatalogSelectChange,
    onMedDaySelectChange,
    onMedShiftTypeChange,
    openMonthlyPlanImport,
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
    applyMatrixBulkEdit,
    openOperationalIncident,
    openVehicleOperationalIncident,
    transitionOperationalIncident,
    openCoverageResolver,
    resolveModalCoverageAvailableAgain,
    resolveCoverageAvailableAgainFromCard,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
    focusOpsAttentionItem,
    applyOpsAttentionFix,
    refreshOpsCenterNow,
    openReportResolution,
    openMonthlyPlanForGroup,
    openMonthlyPlansFull,
    openShiftCell,
    openConflictingDriverAssignment,
    persistShift,
    dailyPlanAssignDriver,
    acquirePlanEditLock,
    releasePlanEditLock,
    breakPlanEditLock,
    confirmBreakPlanEditLock,
    refreshPlanLockBanner,
    opsAssignDriver,
    removeDispatcher,
    removePendingImport,
    removeShift,
    resolveReport,
    returnLostItem,
    setLostItemStatus,
    openLostItemPhoto,
    saveMonthlyDayEdit,
    undoMonthlyDayEdit,
    scrollHubSection,
    selectMonthlyPlanGroup,
    sendScheduleToDrivers,
    setGroupFilter,
    setMessagesPageTab,
    shiftWeekNav,
    submitDispatcherMessage,
    switchScheduleTab,
    toggleDriverActive,
    toggleDriverKG,
    updateDriverBusInline,
    updateDriverShiftInline,
    updatePendingImportDriver,
    updatePendingImportMonth,
    uploadDriverSchedule,
    viewDamagePhoto,
    viewUploadedSchedule
};

export function registerDispatcherOnclickHandlers(win = window) {
    mergeStaffActionHandlers(DISPATCHER_HANDLERS, win);
}
