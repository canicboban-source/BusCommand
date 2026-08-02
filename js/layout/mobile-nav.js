// BusCommand ESM v9.5
import { switchSection } from "./navigation.js";

export const FP_NAV_MAP = {
    'home':     { section: 'driver-dashboard',  btnId: 'fp-nav-home' },
    'shift':    { section: 'driver-calendar',   btnId: 'fp-nav-shift' },
    'reports':  { section: 'driver-reports',    btnId: 'fp-nav-reports' },
    'vacation': { section: 'driver-vacation',   btnId: 'fp-nav-vacation' }
};

function fpNavSwitch(key) {
    var entry = FP_NAV_MAP[key];
    if (!entry) return;

    // Prebaci sekciju (koristi postojeću switchSection)
    if (typeof window.switchSection === 'function') {
        switchSection(entry.section);
    }

    // Ažuriraj aktivno dugme u bottom navu
    Object.keys(FP_NAV_MAP).forEach(function(k) {
        var btn = document.getElementById(FP_NAV_MAP[k].btnId);
        if (btn) btn.classList.remove('active');
    });
    var activeBtn = document.getElementById(entry.btnId);
    if (activeBtn) activeBtn.classList.add('active');
}

// Prikaži/sakrij mobilni nav u zavisnosti od uloge
function updateMobileNavVisibility(role) {
    var nav = document.getElementById('fp-mobile-nav');
    if (!nav) return;
    // Driver surface uses #mobile-bottom-nav (with SOS). Never show legacy fp nav for drivers.
    var isDriver = (role === 'driver');
    nav.style.display = isDriver ? 'none' : 'none';
};

// Sinhronizuj mobilni nav s aktivnom sekcijom iz sidebar klikova
(function patchSwitchSection() {
    var _orig = window.switchSection;
    if (typeof _orig !== 'function') return;
    window.switchSection = function(sectionId) {
        _orig.apply(this, arguments);
        // Odredi koji nav key odgovara ovoj sekciji
        Object.keys(FP_NAV_MAP).forEach(function(k) {
            if (FP_NAV_MAP[k].section === sectionId) {
                var btn = document.getElementById(FP_NAV_MAP[k].btnId);
                if (btn) {
                    // Ukloni active sa svih
                    Object.keys(FP_NAV_MAP).forEach(function(j) {
                        var b = document.getElementById(FP_NAV_MAP[j].btnId);
                        if (b) b.classList.remove('active');
                    });
                    btn.classList.add('active');
                }
            }
        });
    };
})();
export {
    fpNavSwitch,
    updateMobileNavVisibility
};
