// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { showAppLayout } from "./shell.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { canUseDriverOperationalUi } from "../auth/driver-access-gate.js";

function showPreTripModal() {
    if (!canUseDriverOperationalUi()) return false;
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-container").classList.add("hidden");
    const modal = document.getElementById("pre-trip-modal");
    if (modal) {
        modal.classList.remove("hidden");
        // form.reset() je jedini siguran način da Chrome ne restaurira staro stanje checkboxova
        const form = document.getElementById("pre-trip-form");
        if (form) form.reset();
        // Dvojna sigurnost: manuelni reset + odgođeni reset (Chrome form restoration)
        const forceUncheck = () => {
            modal.querySelectorAll("input[type='checkbox']").forEach(cb => { cb.checked = false; });
            if (form) form.reset();
        };
        forceUncheck();
        setTimeout(forceUncheck, 50);
        setTimeout(forceUncheck, 300);
        const fileInput = document.getElementById("pre-trip-damage-file");
        if (fileInput) fileInput.value = "";
    }
    lucide.createIcons();
    return true;
}

function submitPreTripCheck(event) {
    event.preventDefault();
    if (!canUseDriverOperationalUi()) return false;
    const modal = document.getElementById("pre-trip-modal");
    const fileInput = document.getElementById("pre-trip-damage-file");

    // JS validacija — svaki checkbox mora biti ručno označen
    const checkboxes = modal ? Array.from(modal.querySelectorAll("input[type='checkbox']")) : [];
    const unchecked = checkboxes.filter(cb => !cb.checked);
    if (unchecked.length > 0) {
        showToast(t("pretrip_all_required") || "Molimo označite sve stavke pregleda.", "error");
        unchecked[0].closest("label").style.border = "1px solid rgba(239,68,68,0.6)";
        setTimeout(() => unchecked[0].closest("label").style.border = "", 2500);
        return;
    }
    
    let damagePhoto = null;
    
    const saveAndClose = () => {
        if (modal) modal.classList.add("hidden");
        sessionStorage.setItem("buscommand_pretrip_done", "true");
        
        if (window.currentUser && window.currentUser.role === "driver") {
            const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
            if (driver) {
                driver.preTripDone = true;
                if (damagePhoto) {
                    driver.damagePhoto = damagePhoto;
                } else {
                    delete driver.damagePhoto;
                }
                saveState();
            }
        }
        showAppLayout();
    };
    
    showConfirm(
        t("confirm_pretrip") || "Submit pre-trip check?",
        function() {
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    damagePhoto = e.target.result;
                    saveAndClose();
                };
                reader.readAsDataURL(fileInput.files[0]);
            } else {
                saveAndClose();
            }
        },
        { danger: false, title: t("pretrip_title") || "Pre-Trip Pregled", confirmText: t("btn_yes") || "Da" }
    );
}
export {
    showPreTripModal,
    submitPreTripCheck
};
