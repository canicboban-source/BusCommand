// BusCommand ESM v9.5 — accessible global confirm dialog
import { t } from "./i18n.js";
import { attachFocusTrap, detachFocusTrap } from "./focus-trap.js";
import { showToast } from "../core/utils.js";

let _confirmCallback = null;
let _confirmOpts = {};

function ensureReasonMount(msgEl) {
    let mount = document.getElementById("global-confirm-extras");
    if (mount) return mount;
    mount = document.createElement("div");
    mount.id = "global-confirm-extras";
    mount.className = "global-confirm-extras";
    if (msgEl?.parentNode) {
        msgEl.parentNode.insertBefore(mount, msgEl.nextSibling);
    }
    return mount;
}

function clearReasonMount() {
    const mount = document.getElementById("global-confirm-extras");
    if (mount) {
        mount.innerHTML = "";
        mount.classList.add("hidden");
    }
}

function renderReasonPicker(mount, reasons) {
    if (!mount) return;
    mount.classList.remove("hidden");
    const options = (reasons || [])
        .map((r) => {
            const value = String(r.value || "").trim();
            const label = String(r.label || value);
            if (!value) return "";
            return `<option value="${value.replace(/"/g, "&quot;")}">${label.replace(/</g, "&lt;")}</option>`;
        })
        .filter(Boolean)
        .join("");
    mount.innerHTML = `
        <label class="global-confirm-reason-label" for="global-confirm-reason">
            ${t("dispo_reason_label") || "Reason"}
        </label>
        <select id="global-confirm-reason" class="global-confirm-reason" required>
            <option value="">${t("dispo_reason_placeholder") || "Select a reason"}</option>
            ${options}
        </select>
        <label class="global-confirm-note-label hidden" for="global-confirm-note" id="global-confirm-note-wrap-label">
            ${t("dispo_reason_note_label") || "Note (optional)"}
        </label>
        <textarea id="global-confirm-note" class="global-confirm-note hidden" maxlength="120" rows="2"
            placeholder="${t("dispo_reason_note_placeholder") || "Optional short note"}"></textarea>
    `;
    const select = mount.querySelector("#global-confirm-reason");
    const note = mount.querySelector("#global-confirm-note");
    const noteLabel = mount.querySelector("#global-confirm-note-wrap-label");
    const syncNote = () => {
        const show = select?.value === "other";
        note?.classList.toggle("hidden", !show);
        noteLabel?.classList.toggle("hidden", !show);
        if (!show && note) note.value = "";
    };
    select?.addEventListener("change", syncNote);
    syncNote();
}

function readReasonSelection() {
    const select = document.getElementById("global-confirm-reason");
    if (!select) return null;
    const reason = String(select.value || "").trim();
    const noteEl = document.getElementById("global-confirm-note");
    const note = reason === "other" ? String(noteEl?.value || "").trim().slice(0, 120) : "";
    return { reason, note };
}

/**
 * @param {string} message
 * @param {(payload?: { reason?: string, note?: string }) => void} onConfirm
 * @param {{ title?: string, confirmText?: string, danger?: boolean, reasons?: Array<{ value: string, label: string }> }} [opts]
 */
function showConfirm(message, onConfirm, opts = {}) {
    _confirmCallback = onConfirm;
    _confirmOpts = opts || {};
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
    const mount = ensureReasonMount(msgEl);
    if (Array.isArray(opts.reasons) && opts.reasons.length) {
        renderReasonPicker(mount, opts.reasons);
    } else {
        clearReasonMount();
    }
    if (!modal) return;

    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "global-confirm-title");
    modal.style.display = "flex";
    modal.classList.remove("hidden");
    const initial = document.getElementById("global-confirm-reason") || yesBtn;
    attachFocusTrap(modal, { initialFocus: initial });
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
    clearReasonMount();
    _confirmCallback = null;
    _confirmOpts = {};
}

function confirmModalYes() {
    const needsReason = Array.isArray(_confirmOpts.reasons) && _confirmOpts.reasons.length > 0;
    const selection = readReasonSelection();
    if (needsReason) {
        if (!selection?.reason) {
            showToast(t("dispo_reason_required") || "Select a reason.", "error");
            document.getElementById("global-confirm-reason")?.focus();
            return;
        }
    }
    const cb = _confirmCallback;
    const payload = needsReason ? selection : undefined;
    closeConfirmModal();
    if (typeof cb === "function") cb(payload);
}

export {
    showConfirm,
    closeConfirmModal,
    confirmModalYes
};
