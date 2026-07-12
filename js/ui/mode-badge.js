// BusCommand ESM v9.5
function showModeBadge() {
    let badge = document.getElementById("fp-mode-badge");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "fp-mode-badge";
        badge.style.cssText = "position:fixed;top:12px;left:12px;z-index:9999;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;font-family:'Outfit',sans-serif;letter-spacing:0.5px;pointer-events:none;";
        document.body.appendChild(badge);
    }
    if (IS_DEMO_MODE) {
        badge.textContent = "DEMO";
        badge.style.background = "rgba(245,158,11,0.2)";
        badge.style.color = "#fbbf24";
        badge.style.border = "1px solid rgba(245,158,11,0.4)";
    } else {
        badge.textContent = "PRODUCTION";
        badge.style.background = "rgba(16,185,129,0.15)";
        badge.style.color = "#34d399";
        badge.style.border = "1px solid rgba(16,185,129,0.35)";
    }
}
export {
    showModeBadge
};
