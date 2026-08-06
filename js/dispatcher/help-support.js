// BusCommand — Dispatcher self-help → escalate to company contact
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { showModal, closeModal } from "../ui/modals.js";
import { logout } from "../auth/login-dispatcher.js";

const HELP_MODAL_ID = "dispatcher-help-modal";

function isDispatcher() {
    return window.currentUser?.role === "dispatcher";
}

function syncDispatcherHelpButton() {
    const btn = document.getElementById("dispatcher-help-btn");
    if (!btn) return;
    const show = isDispatcher();
    btn.classList.toggle("hidden", !show);
    btn.hidden = !show;
    btn.setAttribute("aria-hidden", show ? "false" : "true");
}

function readContactEmail() {
    const raw = window.state?.profile?.contactEmail
        || window.state?.settings?.contactEmail
        || "";
    return String(raw).trim().toLowerCase();
}

function firebaseStatusLabel() {
    const dot = document.getElementById("firebase-status-dot");
    const cls = String(dot?.className || "");
    if (/\boffline\b/i.test(cls)) return t("dispo_help_status_offline") || "Offline";
    if (/\berror\b/i.test(cls)) return t("dispo_help_status_error") || "Error";
    if (/\bonline\b/i.test(cls) || /\bok\b/i.test(cls)) return t("dispo_help_status_online") || "Online";
    return t("dispo_help_status_unknown") || "Unknown";
}

function buildIncidentBody(note) {
    const user = window.currentUser || {};
    const ua = String(navigator.userAgent || "").slice(0, 160);
    const lines = [
        t("dispo_help_mail_intro") || "Dispatcher needs help after self-recovery steps.",
        "",
        `${t("dispo_help_mail_company") || "Company ID"}: ${user.companyId || "—"}`,
        `${t("dispo_help_mail_dispatcher") || "Dispatcher"}: ${user.name || "—"} <${user.email || user.id || "—"}>`,
        `${t("dispo_help_mail_when") || "When"}: ${new Date().toISOString()}`,
        `${t("dispo_help_mail_url") || "URL"}: ${String(location.href || "").slice(0, 300)}`,
        `${t("dispo_help_mail_status") || "Cloud status"}: ${firebaseStatusLabel()}`,
        `${t("dispo_help_mail_ua") || "Browser"}: ${ua}`,
        "",
        `${t("dispo_help_mail_note") || "Note"}:`,
        String(note || "").trim() || "—"
    ];
    return lines.join("\n");
}

function fillHelpModal() {
    const email = readContactEmail();
    const emailEl = document.getElementById("dispatcher-help-contact-email");
    const missingEl = document.getElementById("dispatcher-help-contact-missing");
    const copyBtn = document.getElementById("dispatcher-help-copy-email");
    const mailto = document.getElementById("dispatcher-help-mailto");
    const statusEl = document.getElementById("dispatcher-help-firebase-status");

    if (statusEl) statusEl.textContent = firebaseStatusLabel();

    if (emailEl) emailEl.textContent = email || "—";
    if (missingEl) missingEl.classList.toggle("hidden", Boolean(email));
    if (copyBtn) copyBtn.disabled = !email;

    if (mailto) {
        if (email) {
            const note = document.getElementById("dispatcher-help-note")?.value || "";
            const subject = encodeURIComponent(t("dispo_help_mail_subject") || "BusCommand dispatcher help");
            const body = encodeURIComponent(buildIncidentBody(note));
            mailto.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
            mailto.removeAttribute("aria-disabled");
            mailto.classList.remove("is-disabled");
        } else {
            mailto.href = "#";
            mailto.setAttribute("aria-disabled", "true");
            mailto.classList.add("is-disabled");
        }
    }
}

function openDispatcherHelp() {
    if (!isDispatcher()) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    fillHelpModal();
    const opened = showModal(HELP_MODAL_ID);
    if (opened && typeof lucide !== "undefined") lucide.createIcons();
    return opened;
}

function closeDispatcherHelp() {
    closeModal(HELP_MODAL_ID);
    return true;
}

function dispatcherHelpSoftReload() {
    if (!isDispatcher()) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    showToast(t("dispo_help_reloading") || "Refreshing data…", "info");
    window.setTimeout(() => {
        window.location.reload();
    }, 200);
    return true;
}

function dispatcherHelpLogout() {
    if (!isDispatcher()) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    closeDispatcherHelp();
    return logout();
}

async function dispatcherHelpCopyEmail() {
    if (!isDispatcher()) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    const email = readContactEmail();
    if (!email) {
        showToast(t("dispo_help_contact_missing"), "warning");
        return false;
    }
    try {
        await navigator.clipboard.writeText(email);
        showToast(t("dispo_help_copied") || "Email copied.", "success");
        return true;
    } catch {
        showToast(t("dispo_help_copy_failed") || "Could not copy email.", "error");
        return false;
    }
}

function dispatcherHelpOpenMailto() {
    if (!isDispatcher()) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    fillHelpModal();
    const email = readContactEmail();
    if (!email) {
        showToast(t("dispo_help_contact_missing"), "warning");
        return false;
    }
    const href = document.getElementById("dispatcher-help-mailto")?.getAttribute("href");
    if (href && href.startsWith("mailto:")) {
        window.location.href = href;
        return true;
    }
    return false;
}

export {
    syncDispatcherHelpButton,
    openDispatcherHelp,
    closeDispatcherHelp,
    dispatcherHelpSoftReload,
    dispatcherHelpLogout,
    dispatcherHelpCopyEmail,
    dispatcherHelpOpenMailto,
    fillHelpModal,
    buildIncidentBody
};
