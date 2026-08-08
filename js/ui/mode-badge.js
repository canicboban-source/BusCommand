// BusCommand ESM — environment badge (never advertises packaged demo mode)
import { USE_LOCAL_STATE } from "../core/runtime-config.js";

function showModeBadge() {
    let badge = document.getElementById("fp-mode-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "fp-mode-badge";
        badge.style.cssText = "position:fixed;top:12px;left:12px;z-index:9999;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:'Outfit',sans-serif;letter-spacing:0.5px;pointer-events:none;";
        document.body.appendChild(badge);
    }
    if (USE_LOCAL_STATE) {
        badge.textContent = "QA LOCAL";
        badge.style.background = "rgba(59,130,246,0.2)";
        badge.style.color = "#93c5fd";
        badge.style.border = "1px solid rgba(59,130,246,0.45)";
        badge.hidden = false;
    } else {
        badge.textContent = "PREVIEW";
        badge.style.background = "rgba(16,185,129,0.15)";
        badge.style.color = "#34d399";
        badge.style.border = "1px solid rgba(16,185,129,0.35)";
        badge.hidden = false;
    }
}
export {
    showModeBadge
};
