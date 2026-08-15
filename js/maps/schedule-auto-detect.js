// BusCommand ESM v9.5
import { t } from "../ui/i18n.js";

// --- PAMETNA DETEKCIJA VOZAČA NA OSNOVU IMENA FAJLA (Auto-detect) ---
document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "upload-schedule-file") {
        const fileInput = e.target;
        if (!fileInput.files || fileInput.files.length === 0) return;
        
        const fileName = fileInput.files[0].name.toLowerCase();
        const driverSelect = document.getElementById("upload-schedule-driver");
        if (!driverSelect) return;
        
        // Ukloni stari feedback ako postoji
        const oldFeedback = document.getElementById("uploader-auto-detect-feedback");
        if (oldFeedback) oldFeedback.remove();
        
        for (const driver of window.state.drivers) {
            const parts = driver.name.toLowerCase().split(" ");
            let match = false;
            
            if (fileName.includes(driver.name.toLowerCase())) {
                match = true;
            } else {
                // Proveri pojedinačne delove imena (npr. samo "boban" ili "canic") duže od 2 slova
                const longParts = parts.filter(p => p.length > 2);
                if (longParts.length > 0 && longParts.some(p => fileName.includes(p))) {
                    match = true;
                }
            }
            
            if (match) {
                driverSelect.value = driver.name;
                
                const feedback = document.createElement("div");
                feedback.id = "uploader-auto-detect-feedback";
                feedback.style.cssText = "color: var(--success-color); font-size: 0.8rem; margin-top: 8px; font-weight: 600; display: flex; align-items: center; gap: 4px; animation: fadeIn 0.3s ease;";
                
                feedback.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px;"></i> ${t("schedule_auto_detect")} <strong>${driver.name}</strong>`;
                
                fileInput.parentNode.appendChild(feedback);
                lucide.createIcons();
                break;
            }
        }
    }
});