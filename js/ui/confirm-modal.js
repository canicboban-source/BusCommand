// BusCommand ESM v9.5
import { t } from "./i18n.js";

// ── GLOBAL CONFIRM MODAL ────────────────────────────────────────────────
let _confirmCallback = null;

function showConfirm(message, onConfirm, opts = {}) {
    _confirmCallback = onConfirm;
    const modal   = document.getElementById("global-confirm-modal");
    const titleEl = document.getElementById("global-confirm-title");
    const msgEl   = document.getElementById("global-confirm-message");
    const yesBtn  = document.getElementById("global-confirm-yes");
    if (titleEl) titleEl.textContent = opts.title || t("confirm_title") || "Potvrda";
    if (msgEl)   msgEl.textContent   = message;
    if (yesBtn) {
        yesBtn.textContent = opts.confirmText || t("btn_yes") || "Da";
        yesBtn.style.background = opts.danger === false
            ? "linear-gradient(135deg,var(--primary-color),#0369a1)"
            : "linear-gradient(135deg,#dc2626,#b91c1c)";
    }
    if (modal) {
        modal.classList.remove("hidden");
        lucide.createIcons();
    }
}

function closeConfirmModal() {
    const modal = document.getElementById("global-confirm-modal");
    if (modal) modal.classList.add("hidden");
    _confirmCallback = null;
}

function confirmModalYes() {
    const cb = _confirmCallback;   // sačuvaj prije nego closeConfirmModal nullira
    closeConfirmModal();
    if (typeof cb === "function") cb();
}
export {
    showConfirm,
    closeConfirmModal,
    confirmModalYes
};
