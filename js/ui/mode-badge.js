// BusCommand ESM — environment badge (Phase 3: never show Trial/Demo/PREVIEW chrome)
import { USE_LOCAL_STATE } from "../core/runtime-config.js";

function showModeBadge() {
    let badge = document.getElementById("fp-mode-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "fp-mode-badge";
        badge.style.cssText = "position:fixed;top:12px;left:12px;z-index:9999;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:'Outfit',sans-serif;letter-spacing:0.5px;pointer-events:none;";
        document.body.appendChild(badge);
    }
    // Product UI must not advertise Trial/Demo/Preview. QA harness may expose a tiny local chip.
    if (USE_LOCAL_STATE && typeof window !== "undefined" && window.__BUSCOMMAND_QA_HARNESS__) {
        badge.textContent = "QA LOCAL";
        badge.style.background = "rgba(59,130,246,0.2)";
        badge.style.color = "#93c5fd";
        badge.style.border = "1px solid rgba(59,130,246,0.45)";
        badge.hidden = false;
        return;
    }
    badge.textContent = "";
    badge.hidden = true;
}
export {
    showModeBadge
};
