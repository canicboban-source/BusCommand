// BusCommand — Company Admin onclick handlers (role graph)
import { applyBrandingSettings, clearCompanyBrandingLogo, handleCompanyBrandingLogoFile } from "./admin/company-admin-branding.js";
import { changeCompanyDriversPage, clearCompanyDriversImport, closeCompanyDriverAddModal, closeCompanyDriverEdit, confirmCompanyDriversImport, deleteCompanyDriver, handleCompanyDriversFile, handleCompanyDriversFilter, handleCompanyDriversSearch, openCompanyDriverAddModal, openCompanyDriverEdit, requestCompanyDriverActivationReset, saveCompanyDriverEdit, submitCompanyDriverManualAdd, toggleCompanyDriverStatus } from "./admin/company-admin-drivers.js";
import { renderCompanyAdminBuses, openCompanyBusesOverview, openCaBusAddModal, closeCaBusAddModal, submitCaBusAdd, openCaBusEdit, saveCaBusEdit, cancelCaBusEdit, changeCaBusGroup, quickSetCaBusStatus, setCaBusOtherLine, toggleCaBusActive } from "./admin/company-admin-buses.js";
import { cancelCompanyGroupEdit, deleteCompanyGroup, focusCompanyGroupForm, saveCompanyGroup, startEditCompanyGroup } from "./admin/company-admin-groups.js";
import { clearCompanyServicePlanPreview, closeCompanyServicePlanDuty, closeCompanyServicePlanHistory, deleteDraftDuty, discardServicePlanDraft, handleCompanyServicePlanFile, handleCompanyServicePlanGroupChange, openAddDutyForm, closeAddDutyForm, openCompanyServicePlanDuty, openCompanyServicePlanHistory, openEditDutyForm, closeEditDutyForm, publishCompanyServicePlan, publishServicePlanDraft, renderDraftDutyTable, renderServicePlanEditor, startServicePlanDraft, submitAddDuty, submitEditDuty, activateCompanyServicePlanVersion } from "./admin/company-admin-service-plan.js";
import { handleCompanySettingsCountry, handleCompanySettingsInput, resetCompanySettingsForm, saveCompanyProfileSettings, handleEmailSmtpInput, resetEmailSmtpForm, saveEmailSmtpSettings } from "./admin/company-admin-settings.js";
import { addCompanyDispatcher, focusCompanyDispatcherForm, removeCompanyDispatcher, resetCompanyDispatcherPassword, revokeCompanyDispatcherSessions, saveCompanyDispatcherGroups, saveCompanyDispatcherProfile, toggleCaDispGroupsEdit, toggleCaDispProfileEdit, toggleCompanyDispatcherStatus } from "./admin/company-admin-team.js";
import { endCompanySupportSession, openCompanyOpsOverview } from "./admin/company-admin.js";
import { exportDriversCSV } from "./core/export-csv.js";
import { clearPackageImport, confirmPackageImport, handlePackageImportDrop, handlePackageImportInput } from "./imports/package-import.js";
import { wizardAddDriverRow, wizardBack, wizardHandleLogo, wizardNext, wizardSelectColor, wizardSkip } from "./features/onboarding.js";
import { mergeStaffActionHandlers } from "./staff/staff-action-handlers.js";

function loadCompanyAdminOnboarding() {
    return import("./admin/company-admin-onboarding.js");
}

function loadCompanyAdminAudit() {
    return import("./admin/company-admin-audit.js");
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

const COMPANY_ADMIN_HANDLERS = {
    addCompanyDispatcher,
    applyBrandingSettings,
    caWizardBack,
    caWizardNext,
    caWizardSelectColor,
    caWizardSelectColorFromHex,
    caWizardSelectColorFromPicker,
    caWizardHandleLogo,
    caWizardSkip,
    cancelCompanyGroupEdit,
    changeCompanyDriversPage,
    clearCompanyBrandingLogo,
    handleCompanyBrandingLogoFile,
    clearCompanyDriversImport,
    clearCompanyServicePlanPreview,
    clearPackageImport,
    closeCompanyDriverAddModal,
    closeCompanyDriverEdit,
    closeCompanyServicePlanDuty,
    closeCompanyServicePlanHistory,
    confirmCompanyDriversImport,
    submitCompanyDriverManualAdd,
    confirmPackageImport,
    deleteCompanyGroup,
    endCompanySupportSession,
    openCompanyBusesOverview,
    openCompanyOpsOverview,
    openCaBusAddModal,
    closeCaBusAddModal,
    submitCaBusAdd,
    openCaBusEdit,
    saveCaBusEdit,
    cancelCaBusEdit,
    changeCaBusGroup,
    quickSetCaBusStatus,
    setCaBusOtherLine,
    toggleCaBusActive,
    renderCompanyAdminBuses,
    exportDriversCSV,
    focusCompanyDispatcherForm,
    focusCompanyGroupForm,
    async handleCompanyAuditFilters(...args) {
        const mod = await loadCompanyAdminAudit();
        return mod.handleCompanyAuditFilters(...args);
    },
    handleCompanyDriversFile,
    handleCompanyDriversFilter,
    handleCompanyDriversSearch,
    handleCompanyServicePlanFile,
    handleCompanyServicePlanGroupChange,
    handleCompanySettingsCountry,
    handleCompanySettingsInput,
    handleEmailSmtpInput,
    handlePackageImportDrop,
    handlePackageImportInput,
    async loadMoreCompanyAudit(...args) {
        const mod = await loadCompanyAdminAudit();
        return mod.loadMoreCompanyAudit(...args);
    },
    openCompanyDriverAddModal,
    openCompanyDriverEdit,
    openCompanyServicePlanDuty,
    openCompanyServicePlanHistory,
    publishCompanyServicePlan,
    publishServicePlanDraft,
    activateCompanyServicePlanVersion,
    closeAddDutyForm,
    closeEditDutyForm,
    deleteDraftDuty,
    discardServicePlanDraft,
    openAddDutyForm,
    openEditDutyForm,
    renderDraftDutyTable,
    renderServicePlanEditor,
    startServicePlanDraft,
    submitAddDuty,
    submitEditDuty,
    async refreshCompanyAudit(...args) {
        const mod = await loadCompanyAdminAudit();
        return mod.refreshCompanyAudit(...args);
    },
    async resetCompanyAuditFilters(...args) {
        const mod = await loadCompanyAdminAudit();
        return mod.resetCompanyAuditFilters(...args);
    },
    resetCompanyDispatcherPassword,
    resetCompanySettingsForm,
    resetEmailSmtpForm,
    revokeCompanyDispatcherSessions,
    saveCompanyDispatcherGroups,
    saveCompanyDispatcherProfile,
    saveCompanyDriverEdit,
    saveCompanyGroup,
    saveCompanyProfileSettings,
    saveEmailSmtpSettings,
    startEditCompanyGroup,
    toggleCaDispGroupsEdit,
    toggleCaDispProfileEdit,
    toggleCompanyDispatcherStatus,
    removeCompanyDispatcher,
    toggleCompanyDriverStatus,
    deleteCompanyDriver,
    requestCompanyDriverActivationReset,
    wizardAddDriverRow,
    wizardBack,
    wizardHandleLogo,
    wizardNext,
    wizardSelectColor,
    wizardSkip
};

export function registerCompanyAdminOnclickHandlers(win = window) {
    mergeStaffActionHandlers(COMPANY_ADMIN_HANDLERS, win);
}
