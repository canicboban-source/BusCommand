// BusCommand — safe row/card overflow menu (⋯). Destructive items stay behind confirm modals.
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml } from "../core/utils.js";
import { t } from "./i18n.js";

let _openMenuId = "";

/**
 * @param {string} menuId
 * @param {Array<{ action: string, args?: unknown[], label: string, icon?: string, danger?: boolean, disabled?: boolean, title?: string }>} items
 */
function rowActionsMenuHtml(menuId, items) {
    const id = String(menuId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const list = (items || [])
        .filter((item) => item && item.action && item.label)
        .map((item) => {
            const danger = item.danger ? " is-danger" : "";
            const disabled = item.disabled ? " disabled aria-disabled=\"true\"" : "";
            const title = item.title ? ` title="${escapeHtml(item.title)}"` : "";
            const icon = item.icon || "circle";
            const args = Array.isArray(item.args) ? item.args : [];
            const invoke = item.disabled ? "" : actionAttr(item.action, args);
            return `<button type="button" role="menuitem" class="row-actions-item${danger}" ${invoke}${disabled}${title}>
                <i data-lucide="${escapeHtml(icon)}" aria-hidden="true"></i>
                <span>${escapeHtml(item.label)}</span>
            </button>`;
        })
        .join("");

    return `<div class="row-actions" data-row-actions="${escapeHtml(id)}">
        <button type="button" class="row-actions-trigger btn-secondary" ${actionAttr("toggleRowActionsMenu", [id])}
            aria-haspopup="menu" aria-expanded="false" aria-controls="row-actions-menu-${escapeHtml(id)}"
            aria-label="${escapeHtml(t("row_actions_menu_aria") || "More actions")}">
            <i data-lucide="ellipsis-vertical" aria-hidden="true"></i>
        </button>
        <div id="row-actions-menu-${escapeHtml(id)}" class="row-actions-menu hidden" role="menu" hidden>
            ${list}
        </div>
    </div>`;
}

function closeAllRowActionsMenus(exceptId = "") {
    document.querySelectorAll(".row-actions").forEach((wrap) => {
        const id = wrap.getAttribute("data-row-actions") || "";
        if (exceptId && id === exceptId) return;
        const menu = wrap.querySelector(".row-actions-menu");
        const trigger = wrap.querySelector(".row-actions-trigger");
        menu?.classList.add("hidden");
        menu?.setAttribute("hidden", "");
        trigger?.setAttribute("aria-expanded", "false");
    });
    if (!exceptId || _openMenuId !== exceptId) _openMenuId = "";
}

function toggleRowActionsMenu(menuId) {
    const id = String(menuId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const wrap = document.querySelector(`[data-row-actions="${id}"]`);
    if (!wrap) return false;
    const menu = wrap.querySelector(".row-actions-menu");
    const trigger = wrap.querySelector(".row-actions-trigger");
    const willOpen = menu?.classList.contains("hidden");
    closeAllRowActionsMenus(willOpen ? id : "");
    if (!menu || !trigger) return false;
    menu.classList.toggle("hidden", !willOpen);
    if (willOpen) menu.removeAttribute("hidden");
    else menu.setAttribute("hidden", "");
    trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
    _openMenuId = willOpen ? id : "";
    if (willOpen && typeof lucide !== "undefined") lucide.createIcons();
    return true;
}

function installRowActionsOutsideClose() {
    if (window.__BUSCOMMAND_ROW_ACTIONS_OUTSIDE__) return;
    window.__BUSCOMMAND_ROW_ACTIONS_OUTSIDE__ = true;
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".row-actions")) return;
        closeAllRowActionsMenus();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAllRowActionsMenus();
    });
}

installRowActionsOutsideClose();

export {
    rowActionsMenuHtml,
    toggleRowActionsMenu,
    closeAllRowActionsMenus
};
