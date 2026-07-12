// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";

// Ažuriranje slika avatara na celom interfejsu (header + profil kartica)
function updateAvatarUI() {
    if (!window.currentUser) return;
    
    let avatarUrl = "";
    if (window.currentUser.role === "driver") {
        const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
        if (driver && driver.avatar) {
            avatarUrl = driver.avatar;
        }
    }
    
    const headerImg = document.getElementById("header-user-avatar-img");
    const headerPlaceholder = document.getElementById("header-user-avatar-placeholder");
    const dashImg = document.getElementById("driver-dashboard-avatar-img");
    const dashPlaceholder = document.getElementById("driver-dashboard-avatar-placeholder");
    const profileName = document.getElementById("driver-profile-name");
    const profileBus = document.getElementById("driver-profile-bus");

    // Header avatar
    if (headerImg && headerPlaceholder) {
        if (avatarUrl) {
            headerImg.src = avatarUrl;
            headerImg.classList.remove("hidden");
            headerPlaceholder.classList.add("hidden");
        } else {
            headerImg.classList.add("hidden");
            headerPlaceholder.classList.remove("hidden");
        }
    }
    
    // Dashboard profile card (samo za vozača)
    if (window.currentUser.role === "driver") {
        if (profileName) profileName.textContent = window.currentUser.name;
        if (profileBus) profileBus.textContent = window.currentUser.bus || "-";
        
        if (dashImg && dashPlaceholder) {
            if (avatarUrl) {
                dashImg.src = avatarUrl;
                dashImg.classList.remove("hidden");
                dashPlaceholder.classList.add("hidden");
            } else {
                dashImg.classList.add("hidden");
                dashPlaceholder.classList.remove("hidden");
            }
        }
    }
}

// Pokretanje izbora fajla za sliku profila
function triggerAvatarUpload() {
    const fileInput = document.getElementById("driver-avatar-file-input");
    if (fileInput) fileInput.click();
}

// Obrada učitane slike, promena veličine i kompresija
function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
        showToast("Dozvoljeni su samo slikovni fajlovi (jpg/png).", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            
            const max_size = 180; // Maksimalna širina/visina u pikselima
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > max_size) {
                    height *= max_size / width;
                    width = max_size;
                }
            } else {
                if (height > max_size) {
                    width *= max_size / height;
                    height = max_size;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Kompresija na JPEG sa 80% kvaliteta da bi fajl bio lagan za localStorage (do 15kb)
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.80);
            
            if (window.currentUser && window.currentUser.role === "driver") {
                const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
                if (driver) {
                    driver.avatar = compressedBase64;
                    saveState();
                    updateAvatarUI();
                    
                    let msg = "Fotografija uspešno ažurirana!";
                    if (window.state.language === "de") msg = "Profilbild erfolgreich aktualisiert!";
                    else if (window.state.language === "en") msg = "Profile picture updated successfully!";
                    showToast(msg, "success");
                }
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
export {
    updateAvatarUI,
    triggerAvatarUpload,
    handleAvatarUpload
};
