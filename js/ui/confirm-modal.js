// BusCommand ESM v9.5 — accessible global confirm dialog
import { t } from "./i18n.js";

let _confirmCallback = null;
let _previousFocus = null;
let _keyHandler = null;

function focusableIn(modal) {
    return [...modal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

function detachKeyHandler() {
    if (_keyHandler) {
        document.removeEventListener("keydown", _keyHandler, true);
        _keyHandler = null;
    }
}

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

    _previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "global-confirm-title");
    modal.removeAttribute("aria-hidden");
    modal.style.display = "flex";
    modal.classList.remove("hidden");

    detachKeyHandler();
    _keyHandler = (event) => {
        if (modal.classList.contains("hidden")) return;
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeConfirmModal();
            return;
        }
        if (event.key !== "Tab") return;
        const nodes = focusableIn(modal);
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };
    document.addEventListener("keydown", _keyHandler, true);

    requestAnimationFrame(() => {
        const nodes = focusableIn(modal);
        (nodes[0] || yesBtn)?.focus();
        if (typeof lucide !== "undefined") lucide.createIcons();
    });
}

function closeConfirmModal() {
    const modal = document.getElementById("global-confirm-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
    detachKeyHandler();
    _confirmCallback = null;
    const restore = _previousFocus;
    _previousFocus = null;
    if (restore && typeof restore.focus === "function" && document.contains(restore)) {
        restore.focus();
    }
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
