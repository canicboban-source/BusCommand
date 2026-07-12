// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { setShiftForDriverDate } from "../core/shift-plan.js";
import { getVisibleDrivers, showToast, todayDateStr } from "../core/utils.js";
import { getGroupById, renderGroupFilterBar } from "../data/groups.js";
import { renderShiftsWeeklyGrid } from "./shift-grid.js";
import { getWeekDates } from "./shift-utils.js";
import { t } from "../ui/i18n.js";

function renderDispatcherShifts() {
    // Renderi group filter bar
    renderGroupFilterBar("group-filter-bar-shifts");

    // Filtriraj vozače po grupi
    const filteredDrivers = getVisibleDrivers().filter(d =>
        !window.state.activeGroupFilter || d.groupId === window.state.activeGroupFilter
    );

    // Popuni dropdown vozača
    const driverSel = document.getElementById("shift-driver-select");
    if (driverSel) {
        driverSel.innerHTML = "";
        filteredDrivers.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d.name;
            const g = getGroupById(d.groupId);
            opt.innerText = g ? `${d.name} [${g.name}]` : d.name;
            driverSel.appendChild(opt);
        });
    }

    // Postavi default datum na danas
    const dateInput = document.getElementById("shift-date-input");
    if (dateInput && !dateInput.value) dateInput.value = todayDateStr();

    // Prikaži oznaku nedelje
    const weekDays = getWeekDates(window.currentShiftWeekOffset);
    const label = document.getElementById("shifts-week-label");
    if (label) {
        const from = weekDays[0];
        const to   = weekDays[6];
        label.textContent = `${from.getDate()}.${from.getMonth()+1}. – ${to.getDate()}.${to.getMonth()+1}.${to.getFullYear()}`;
    }

    renderShiftsWeeklyGrid(weekDays);
    lucide.createIcons();
}


function openShiftCell(driverName, dateStr) {
    // Popuni formu sa izabranim vozačem i datumom
    const driverSel = document.getElementById("shift-driver-select");
    const dateInput = document.getElementById("shift-date-input");
    if (driverSel) driverSel.value = driverName;
    if (dateInput) dateInput.value = dateStr;
    // Skroluj do forme
    const form = document.querySelector(".shift-form-grid");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function assignShift() {
    const driverName = document.getElementById("shift-driver-select")?.value;
    const date       = document.getElementById("shift-date-input")?.value;
    const type       = document.getElementById("shift-type-select")?.value;
    const name       = document.getElementById("shift-name-input")?.value?.trim() || "";

    if (!driverName || !date) {
        showToast(t("shift_err_required") || "Izaberite vozača i datum", "error"); return;
    }

    if (type === "off" && !name) {
        setShiftForDriverDate(driverName, date, { type: "off", name: t("shift_off") || "Slobodan dan" });
    } else if (type === "off") {
        setShiftForDriverDate(driverName, date, { type: "off", name });
    } else {
        setShiftForDriverDate(driverName, date, { type, name });
    }

    saveState();
    showToast(`✓ ${driverName} — ${date}`, "success");

    const nameInput = document.getElementById("shift-name-input");
    if (nameInput) nameInput.value = "";
}

function removeShift(driverName, dateStr) {
    setShiftForDriverDate(driverName, dateStr, { type: "clear" });
    saveState();
    showToast(t("shift_removed") || "Smena uklonjena", "info");
}
export {
    renderDispatcherShifts,
    openShiftCell,
    assignShift,
    removeShift
};
