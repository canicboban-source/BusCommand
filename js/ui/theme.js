// BusCommand ESM v9.5
function applyStoredTheme() {
    const theme = localStorage.getItem("buscommand_theme") || "dark";
    const isLight = theme === "light";
    document.body.classList.toggle("light-theme", isLight);
    const icon = document.getElementById("theme-icon");
    if (icon) {
        icon.setAttribute("data-lucide", isLight ? "sun" : "moon");
        if (typeof lucide !== "undefined") lucide.createIcons();
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle("light-theme");
    localStorage.setItem("buscommand_theme", isLight ? "light" : "dark");
    const icon = document.getElementById("theme-icon");
    if (icon) {
        icon.setAttribute("data-lucide", isLight ? "sun" : "moon");
        lucide.createIcons();
    }
}
export {
    applyStoredTheme,
    toggleTheme
};
