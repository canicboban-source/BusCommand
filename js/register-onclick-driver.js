// BusCommand — driver surface action handlers
import { cancelDriverActivation, openDriverActivation, submitDriverActivation } from "./auth/driver-activation.js";
import { logout } from "./auth/login-dispatcher.js";
import { loginAsDriver } from "./auth/login-driver.js";
import { switchLoginTab } from "./auth/login-ui.js";
import { clickElementById, installActionDelegates, removeElementById } from "./core/action-delegate.js";
import { handleAvatarUpload, triggerAvatarUpload } from "./driver/avatar.js";
import { confirmTomorrowShift } from "./driver/calendar.js";
import { callDispatcher, driverCheckIn, openDriverMessagesNav, sendDriverSosNow } from "./driver/dashboard.js";
import { resolveSOS } from "./maps/sos-siren.js";
import { archiveMessage, archiveReadMessages, confirmMessageRead } from "./driver/message-alerts.js";
import { markMessageAsRead } from "./driver/messages-inbox.js";
import { sendQuickReport } from "./driver/quick-reports.js";
import { submitBreakdownReport, submitDelayReport, submitLostItem, submitVacationRequest } from "./driver/reports.js";
import { fpNavSwitch } from "./layout/mobile-nav.js";
import { switchSection } from "./layout/navigation.js";
import { submitPreTripCheck } from "./layout/pretrip.js";
import { viewDamagePhoto } from "./maps/damage-photo.js";
import { viewUploadedSchedule } from "./maps/schedule-viewer.js";
import { closeConfirmModal, confirmModalYes } from "./ui/confirm-modal.js";
import { changeLanguage, t } from "./ui/i18n.js";
import { closeModal, closeSosConfirmModal, confirmClearSOS, confirmResolveSOS, showModal } from "./ui/modals.js";
import { toggleTheme } from "./ui/theme.js";
import { canInvokeActionDuringDriverActivation } from "./auth/driver-access-gate.js";

const HANDLERS = {
    archiveMessage,
    archiveReadMessages,
    cancelDriverActivation,
    changeLanguage,
    clickElementById,
    closeConfirmModal,
    closeModal,
    closeSosConfirmModal,
    callDispatcher,
    confirmClearSOS,
    confirmMessageRead,
    confirmModalYes,
    confirmResolveSOS,
    sendDriverSosNow,
    confirmTomorrowShift,
    driverCheckIn,
    fpNavSwitch,
    handleAvatarUpload,
    loginAsDriver,
    logout,
    markMessageAsRead,
    openDriverActivation,
    openDriverMessagesNav,
    removeElementById,
    resolveSOS,
    sendQuickReport,
    showModal,
    submitBreakdownReport,
    submitDelayReport,
    submitDriverActivation,
    submitLostItem,
    submitPreTripCheck,
    submitVacationRequest,
    switchLoginTab,
    switchSection,
    t,
    toggleTheme,
    triggerAvatarUpload,
    viewDamagePhoto,
    viewUploadedSchedule
};

export function registerOnclickHandlers(win = window) {
    for (const [name, fn] of Object.entries(HANDLERS)) {
        if (typeof fn === "function") {
            win[name] = (...args) => (canInvokeActionDuringDriverActivation(name) ? fn(...args) : false);
        }
    }
    installActionDelegates(HANDLERS, document);
}
