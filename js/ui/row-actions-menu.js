// Row actions: 1 item → direct button; 2+ → fixed portal ⋯ menu (not clipped).
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml } from "../core/utils.js";
import { t } from "./i18n.js";

let _openMenuId = "";
/** @type {HTMLElement | null} */
let _portedMenu = null;
/** @type {HTMLElement | null} */
let _portedHost = null;

/** @param {string} menuId @param {Array<{ action: string, args?: unknown[], label: string, icon?: string, danger?: boolean, disabled?: boolean, title?: string }>} items */
function rowActionsMenuHtml(menuId, items) {
    const id = String(menuId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const list = (items || []).filter((item) => item && item.action && item.label);
    if (!list.length) return "";

    if (list.length === 1) {
        const item = list[0];
        const danger = item.danger ? " btn-danger-ghost is-danger" : " btn-secondary";
        const disabled = item.disabled ? " disabled aria-disabled=\"true\"" : "";
        const title = item.title ? ` title="${escapeHtml(item.title)}"` : "";
        const icon = item.icon || "circle";
        const args = Array.isArray(item.args) ? item.args : [];
        const invoke = item.disabled ? "" : actionAttr(item.action, args);
        return `<button type="button" class="row-actions-direct${danger}" ${invoke}${disabled}${title}>
            <i data-lucide="${escapeHtml(icon)}" aria-hidden="true"></i>
            <span>${escapeHtml(item.label)}</span>
        </button>`;
    }

    const buttons = list.map((item) => {
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
    }).join("");

    return `<div class="row-actions" data-row-actions="${escapeHtml(id)}">
        <button type="button" class="row-actions-trigger btn-secondary" ${actionAttr("toggleRowActionsMenu", [id], { stopPropagation: true })}
            aria-haspopup="menu" aria-expanded="false" aria-controls="row-actions-menu-${escapeHtml(id)}"
            aria-label="${escapeHtml(t("row_actions_menu_aria") || "More actions")}">
            <i data-lucide="ellipsis-vertical" aria-hidden="true"></i>
        </button>
        <div id="row-actions-menu-${escapeHtml(id)}" class="row-actions-menu hidden" role="menu" hidden>
            ${buttons}
        </div>
    </div>`;
}

function restorePortedMenu() {
    if (_portedMenu && _portedHost && _portedMenu.parentElement === document.body) {
        _portedHost.appendChild(_portedMenu);
    }
    _portedMenu = null;
    _portedHost = null;
}

function closeAllRowActionsMenus(exceptId = "") {
    restorePortedMenu();
    document.querySelectorAll(".row-actions").forEach((wrap) => {
        const id = wrap.getAttribute("data-row-actions") || "";
        if (exceptId && id === exceptId) return;
        const menu = wrap.querySelector(".row-actions-menu");
        const trigger = wrap.querySelector(".row-actions-trigger");
        menu?.classList.add("hidden");
        menu?.setAttribute("hidden", "");
        if (menu) {
            menu.style.top = "";
            menu.style.left = "";
            menu.style.right = "";
            menu.style.bottom = "";
            menu.style.position = "";
            menu.style.zIndex = "";
        }
        trigger?.setAttribute("aria-expanded", "false");
    });
    if (!exceptId || _openMenuId !== exceptId) _openMenuId = "";
}

function positionRowActionsMenu(menu, trigger) {
    if (!menu || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = Math.max(180, menu.offsetWidth || 180);
    const menuHeight = Math.max(44, menu.offsetHeight || 44);
    const gap = 6;
    const openUp = rect.bottom + gap + menuHeight > window.innerHeight - 8;
    let top = openUp ? rect.top - gap - menuHeight : rect.bottom + gap;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) left = Math.max(8, window.innerWidth - menuWidth - 8);
    if (top < 8) top = 8;
    menu.style.position = "fixed";
    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.zIndex = "10050";
}

function toggleRowActionsMenu(menuId) {
    const id = String(menuId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const wrap = document.querySelector(`[data-row-actions="${id}"]`);
    if (!wrap) return false;
    const trigger = wrap.querySelector(".row-actions-trigger");
    const menu =
        document.getElementById(`row-actions-menu-${id}`)
        || wrap.querySelector(".row-actions-menu");
    if (!menu || !trigger) return false;
    const willOpen = menu.classList.contains("hidden") || menu.hasAttribute("hidden");
    if (!willOpen) {
        closeAllRowActionsMenus();
        return true;
    }
    closeAllRowActionsMenus(id);
    const liveMenu =
        document.getElementById(`row-actions-menu-${id}`)
        || wrap.querySelector(".row-actions-menu");
    if (!liveMenu) return false;
    liveMenu.classList.remove("hidden");
    liveMenu.removeAttribute("hidden");
    // Portal to body so overflow:hidden ancestors cannot clip the menu.
    _portedHost = wrap;
    _portedMenu = liveMenu;
    document.body.appendChild(liveMenu);
    positionRowActionsMenu(liveMenu, trigger);
    requestAnimationFrame(() => positionRowActionsMenu(liveMenu, trigger));
    trigger.setAttribute("aria-expanded", "true");
    _openMenuId = id;
    if (typeof lucide !== "undefined") lucide.createIcons();
    return true;
}

function installRowActionsOutsideClose() {
    if (window.__BUSCOMMAND_ROW_ACTIONS_OUTSIDE__) return;
    window.__BUSCOMMAND_ROW_ACTIONS_OUTSIDE__ = true;
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".row-actions") || target.closest(".row-actions-menu")) return;
        closeAllRowActionsMenus();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAllRowActionsMenus();
    });
    window.addEventListener("resize", () => closeAllRowActionsMenus());
    window.addEventListener("scroll", () => closeAllRowActionsMenus(), true);
}

installRowActionsOutsideClose();

export {
    rowActionsMenuHtml,
    toggleRowActionsMenu,
    closeAllRowActionsMenus
};
