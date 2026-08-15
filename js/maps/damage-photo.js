// BusCommand ESM v9.5

// --- PREGLED SLIKA OŠTEĆENJA ---
function viewDamagePhoto(driverName) {
    const driver = window.state.drivers.find(d => d.name === driverName);
    if (!driver || !driver.damagePhoto) return;
    
    const modal = document.getElementById("schedule-viewer-modal");
    const title = document.getElementById("schedule-viewer-title");
    const body = document.getElementById("schedule-viewer-body");
    const downloadLink = document.getElementById("schedule-download-link");
    
    if (!modal || !title || !body || !downloadLink) return;
    
    const lang = window.state.language || "sr";
    if (lang === "de") {
        title.innerText = `Fahrzeugschaden - ${driverName}`;
    } else if (lang === "en") {
        title.innerText = `Vehicle Damage - ${driverName}`;
    } else {
        title.innerText = `Oštećenje vozila - ${driverName}`;
    }
    
    body.innerHTML = `<img src="${driver.damagePhoto}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:var(--radius-sm); box-shadow: 0 4px 15px rgba(0,0,0,0.4);">`;
    
    downloadLink.href = driver.damagePhoto;
    downloadLink.download = `ostecenje_${driverName.replace(/\s+/g, '_')}.png`;
    
    modal.classList.remove("hidden");
    lucide.createIcons();
}
export {
    viewDamagePhoto
};
