// BusCommand ESM v9.5 — accessible global confirm dialog
import { t } from "./i18n.js";
import { attachFocusTrap, detachFocusTrap } from "./focus-trap.js";

let _confirmCallback = null;

function showConfirm(message, onConfirm, opts = {}) {
    _confirmCallback = onConfirm;
    const modal = document.getElementById("global-confirm-modal");
    const titleEl = document.getElementById("global-confirm-title");
    const msgEl = document.getElementById("global-confirm-message");
    const yesBtn = document.getElementById("global-confirm-yes");
    if (titleEl) titleEl.textContent = opts.title || t("confirm_title") || "Confirm";
    if (msgEl) msgEl.textContent = message;
    if (yesBtn) {
        yesBtn.textContent = opts.confirmText || t("btn_yes") || "Yes";
        yesBtn.classList.toggle("is-primary-confirm", opts.danger === false);
        yesBtn.classList.toggle("is-danger-confirm", opts.danger !== false);
        yesBtn.style.background = opts.danger === false
            ? "linear-gradient(135deg,var(--primary-color),var(--primary-hover))"
            : "linear-gradient(135deg,var(--danger-color),#b91c1c)";
    }
    if (!modal) return;

    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "global-confirm-title");
    modal.style.display = "flex";
    modal.classList.remove("hidden");
    attachFocusTrap(modal, { initialFocus: yesBtn });
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeConfirmModal() {
    const modal = document.getElementById("global-confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
        detachFocusTrap(modal);
    }
    _confirmCallback = null;
}

function confirmModalYes() {
    const cb = _confirmCallback;
    closeConfirmModal();
    if (typeof cb === "function") cb();
}

export {
    showConfirm,
    closeConfirmModal,
    confirmModalYes
};
