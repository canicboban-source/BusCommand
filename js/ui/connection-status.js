// BusCommand — header connection chip (online / offline / reconnecting)
import { t } from "./i18n.js";

const CHIP_ID = "header-connection-status";

function ensureChip() {
    let el = document.getElementById(CHIP_ID);
    if (el) return el;
    const host = document.querySelector(".app-header .header-left");
    if (!host) return null;
    el = document.createElement("div");
    el.id = CHIP_ID;
    el.className = "header-connection-status";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    host.appendChild(el);
    return el;
}

function renderHeaderConnectionStatus() {
    const el = ensureChip();
    if (!el) return;
    const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    el.dataset.state = online ? "online" : "offline";
    const label = online
        ? (t("header_connection_online") || "Online")
        : (t("header_connection_offline") || "Offline");
    el.textContent = label;
    el.title = label;
}

function startHeaderConnectionStatus() {
    renderHeaderConnectionStatus();
    if (window.__BUSCOMMAND_HEADER_CONN__) return;
    window.__BUSCOMMAND_HEADER_CONN__ = true;
    window.addEventListener("online", renderHeaderConnectionStatus);
    window.addEventListener("offline", renderHeaderConnectionStatus);
}

export {
    renderHeaderConnectionStatus,
    startHeaderConnectionStatus
};
