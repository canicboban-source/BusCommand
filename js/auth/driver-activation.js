import Auth from "../core/auth-client.js";
import { clearAllPasswordFields } from "./password-fields.js";
import { showLoginScreen } from "./login-ui.js";
import { t } from "../ui/i18n.js";
import { clearUserSession } from "./login-session.js";
import { clearTenantStateCache, resetInMemoryTenantState } from "../core/state.js";
import { COMPANY_ID } from "../core/runtime-config.js";
import {
    clearDriverFileInputs,
    isDriverActivationPending,
    setDriverActivationPending
} from "./driver-access-gate.js";

let pendingActivation = null;
let activationRequestId = 0;
let activationGuardsInstalled = false;

function clearActivationInput() {
    const input = document.getElementById("driver-activation-code");
    const confirm = document.getElementById("driver-activation-code-confirm");
    if (input) input.value = "";
    if (confirm) confirm.value = "";
}

function setActivationVisible(visible) {
    const modal = document.getElementById("driver-activation-modal");
    if (!modal) return;
    modal.classList.toggle("hidden", !visible);
    modal.style.display = visible ? "flex" : "none";
    document.getElementById("login-screen")?.classList.toggle("hidden", visible);
    document.getElementById("app-container")?.classList.add("hidden");
}

function openDriverActivation(onActivated) {
    const wasPending = isDriverActivationPending();
    setDriverActivationPending(true);
    activationRequestId += 1;
    pendingActivation = typeof onActivated === "function" ? onActivated : null;
    clearActivationInput();
    const error = document.getElementById("driver-activation-error");
    if (error) { error.textContent = ""; error.classList.add("hidden"); }
    setActivationVisible(true);
    document.getElementById("driver-activation-code")?.focus();
    installActivationExitGuards();
    if (!wasPending) history.pushState({ driverActivation: true }, "", window.location.href);
}

async function cancelDriverActivation() {
    activationRequestId += 1;
    clearActivationInput();
    pendingActivation = null;
    const companyId = window.currentUser?.companyId || COMPANY_ID;
    clearDriverFileInputs();
    clearAllPasswordFields();
    await Auth.logout();
    window.currentUser = null;
    clearUserSession();
    setDriverActivationPending(false);
    setActivationVisible(false);
    showLoginScreen(false);
    clearTenantStateCache(companyId);
    resetInMemoryTenantState(window.state?.language || localStorage.getItem("buscommand_lang") || "en");
}

function closeDriverActivationForSignedOut() {
    activationRequestId += 1;
    pendingActivation = null;
    clearActivationInput();
    clearDriverFileInputs();
    setActivationVisible(false);
    setDriverActivationPending(false);
}

function installActivationExitGuards() {
    if (activationGuardsInstalled) return;
    activationGuardsInstalled = true;
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isDriverActivationPending()) {
            event.preventDefault();
            cancelDriverActivation();
        }
    });
    document.addEventListener("click", (event) => {
        if (isDriverActivationPending() && event.target?.id === "driver-activation-modal") {
            cancelDriverActivation();
        }
    });
    window.addEventListener("popstate", () => {
        if (isDriverActivationPending()) cancelDriverActivation();
    });
}

async function submitDriverActivation(event) {
    event?.preventDefault();
    const input = document.getElementById("driver-activation-code");
    const confirm = document.getElementById("driver-activation-code-confirm");
    const submit = document.getElementById("driver-activation-submit");
    const error = document.getElementById("driver-activation-error");
    const personalLoginCode = input?.value || "";
    const personalConfirm = confirm?.value || "";
    if (error) error.classList.add("hidden");
    // Validate before wiping the fields, otherwise the driver reads a mismatch
    // message next to two empty inputs and has to retype both.
    const invalidFormat = !/^\d{5,12}$/.test(personalLoginCode);
    if (invalidFormat || personalLoginCode !== personalConfirm) {
        if (error) {
            error.textContent = t(invalidFormat ? "driver_activation_format" : "driver_activation_mismatch");
            error.classList.remove("hidden");
        }
        if (invalidFormat) {
            input?.focus();
        } else {
            if (confirm) confirm.value = "";
            confirm?.focus();
        }
        return false;
    }
    clearActivationInput();
    const requestId = ++activationRequestId;
    if (submit) { submit.disabled = true; submit.textContent = t("driver_activation_loading"); }
    const result = await Auth.activatePersonalLoginCode(personalLoginCode);
    if (requestId !== activationRequestId) {
        await Auth.logout();
        return false;
    }
    if (submit) { submit.disabled = false; submit.textContent = t("driver_activation_activate"); }
    if (!result.success) {
        if (error) { error.textContent = t("driver_activation_error"); error.classList.remove("hidden"); }
        return false;
    }
    const complete = pendingActivation;
    pendingActivation = null;
    setDriverActivationPending(false);
    setActivationVisible(false);
    if (complete) await complete(result.user);
    return true;
}

export {
    openDriverActivation,
    cancelDriverActivation,
    submitDriverActivation,
    clearActivationInput,
    closeDriverActivationForSignedOut
};
