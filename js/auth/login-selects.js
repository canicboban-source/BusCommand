// BusCommand — login dropdowns (bez circular importa sa i18n)

function loginT(key) {
    const lang = window.state?.language || localStorage.getItem("buscommand_lang") || "en";
    const dict = window.TRANSLATIONS?.[lang] || window.TRANSLATIONS?.en || {};
    return dict[key] || key;
}

function initializeLoginSelects() {
    const driverSelect = document.getElementById("login-driver-select");
    if (!driverSelect) return;

    const selectedName = driverSelect.value;
    driverSelect.innerHTML = "";

    if (!window.state?.drivers || window.state.drivers.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.disabled = true;
        opt.selected = true;
        opt.innerText = loginT("no_drivers_registered");
        driverSelect.appendChild(opt);
        return;
    }

    window.state.drivers.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.name;
        opt.innerText = d.name;
        if (d.name === selectedName) opt.selected = true;
        driverSelect.appendChild(opt);
    });

    if (!selectedName && driverSelect.options.length) {
        driverSelect.selectedIndex = 0;
    }
}

export { initializeLoginSelects };
