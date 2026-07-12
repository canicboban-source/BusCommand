// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

function renderTomorrowShiftForDriver() {
    const container = document.getElementById("driver-next-shift-container");
    if (!container) return;
    
    const myShift = (window.state.tomorrowShifts || []).find(s => s.driver === window.currentUser.name);
    if (!myShift) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">${t("no_shift_tomorrow") || "No shift scheduled for tomorrow."}</div>`;
        return;
    }
    
    const isConfirmed = myShift.confirmed;
    
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 15px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">${t("duty_number")}:</span>
                <span style="font-weight: 700; color: var(--primary-color); font-size: 1.1rem; background: rgba(var(--primary-rgb), 0.1); padding: 2px 8px; border-radius: 4px;">${myShift.shift}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">${t("vehicle")}:</span>
                <span style="font-weight: 600; color: var(--text-main);"><i data-lucide="bus" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i>${myShift.bus}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">Status:</span>
                ${isConfirmed 
                    ? `<span style="font-size: 0.85rem; color: var(--success-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> ${t("status_confirmed")}
                       </span>`
                    : `<span style="font-size: 0.85rem; color: var(--warning-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="clock" style="width: 14px; height: 14px;"></i> ${t("status_pending_confirmation")}
                       </span>`
                }
            </div>
            ${!isConfirmed 
                ? `<button ${actionAttr("confirmTomorrowShift", [window.currentUser.name])} class="btn-primary" style="margin-top: 5px; font-size: 0.9rem; padding: 8px 12px; height: auto; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i data-lucide="check-square" style="width: 14px; height: 14px;"></i> ${t("btn_confirm_shift")}
                   </button>`
                : ''
            }
        </div>
    `;
    lucide.createIcons();
}

function confirmTomorrowShift(driverName) {
    const shift = (window.state.tomorrowShifts || []).find(s => s.driver === driverName);
    if (shift) {
        shift.confirmed = true;
        saveState();
        if (window.currentUser && window.currentUser.role === "driver") {
            renderTomorrowShiftForDriver();
        } else if (window.currentUser && window.currentUser.role === "dispatcher") {
            renderDispatcherShiftsConfirmation();
        }
        showToast(t("status_confirmed") || "Shift confirmed!", "success", 3000);
    }
}
function renderDispatcherShiftsConfirmation() {
    const container = document.getElementById("dispatcher-confirm-shifts-list");
    if (!container) return;
    container.innerHTML = "";
    
    (window.state.tomorrowShifts || []).forEach(shift => {
        const div = document.createElement("div");
        div.className = "confirm-shift-item";
        div.style.cssText = "background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 12px; display: flex; justify-content: space-between; align-items: center;";
        
        const isConfirmed = shift.confirmed;
        
        div.innerHTML = `
            <div>
                <div style="font-weight:600; color:var(--text-main);">${shift.driver}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                    ${t("shift")}: <strong style="color:var(--primary-color);">${shift.shift}</strong> | ${t("label_bus")}: <strong>${shift.bus}</strong>
                </div>
            </div>
            <div>
                ${isConfirmed 
                    ? `<span style="color:var(--success-color); font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
                        <i data-lucide="check-circle" style="width:14px; height:14px;"></i> ${t("status_confirmed")}
                       </span>`
                    : `<button ${actionAttr("confirmTomorrowShift", [shift.driver])} class="btn-table-action" style="padding: 4px 8px; font-size: 0.8rem;">
                        <i data-lucide="check" style="width:12px; height:12px; margin-right:4px;"></i> ${t("btn_confirm_shift")}
                       </button>`
                }
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

// --- KALENDAR VOZAČA ---
function renderDriverCalendar() {
    const container = document.getElementById("calendar-days-container");
    container.innerHTML = "";
    
    // Proveri da li postoji okačeni plan rada za ovog vozača za Jun 2026
    const downloadCard = document.getElementById("driver-schedule-download-card");
    const filenameLabel = document.getElementById("driver-schedule-filename");
    
    if (downloadCard && filenameLabel) {
        const scheduleKey = `${window.currentUser.name}_2026-06`;
        const schedule = getScheduleByKey(scheduleKey);
        
        if (schedule) {
            downloadCard.style.display = "flex";
            filenameLabel.innerText = `${schedule.fileName} (${(schedule.fileData.length / 1024 * 0.75).toFixed(1)} KB)`;
        } else {
            downloadCard.style.display = "none";
        }
    }

    const totalDays = 30;
    
    const lang = window.state.language || "sr";
    const monthNames = {
        sr: "Jun 2026", hr: "Lipanj 2026", en: "June 2026", de: "Juni 2026",
        fr: "Juin 2026", it: "Giugno 2026", es: "Junio 2026", pl: "Czerwiec 2026",
        cs: "Červen 2026", sk: "Jún 2026", nl: "Juni 2026", tr: "Haziran 2026",
        pt: "Junho 2026", ro: "Iunie 2026", hu: "Június 2026", bg: "Юни 2026"
    };
    document.getElementById("calendar-month-year").innerText = monthNames[lang] || "June 2026";
    
    const approvedVacations = window.state.vacations.filter(v => v.driver === window.currentUser.name && (v.status === "approved" || v.status === "Odobreno"));
    
    // Izračunaj pomeraj za prvi dan u mesecu (evropska sedmica: Ponedeljak = 1, Nedelja = 7)
    const firstDayDate = new Date(`${currentCalendarMonth}-01`);
    let startDayOfWeek = firstDayDate.getDay(); 
    if (startDayOfWeek === 0) startDayOfWeek = 7;
    const offset = startDayOfWeek - 1;
    
    // Dodaj prazne ćelije za dane koji pripadaju prvoj nepotpunoj sedmici
    for (let i = 0; i < offset; i++) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "calendar-day empty-day";
        emptyDiv.style.opacity = "0.2";
        emptyDiv.style.pointerEvents = "none";
        emptyDiv.innerHTML = `<span class="day-number" style="opacity:0.2;">-</span>`;
        container.appendChild(emptyDiv);
    }
    
    for (let day = 1; day <= totalDays; day++) {
        const div = document.createElement("div");
        div.className = "calendar-day";
        
        const dateStr = `2026-06-${day.toString().padStart(2, '0')}`;
        
        let isOnVacation = false;
        approvedVacations.forEach(v => {
            if (dateStr >= v.start && dateStr <= v.end) {
                isOnVacation = true;
            }
        });
        
        let shiftClass = "";
        let shiftName = "";
        
        if (window.currentUser.name === "Canic Boban") {
            const bobanShifts = {
                2: { type: "vacation", name: "Urlaub" },
                4: { type: "morning", name: "320.S08 (Bus 91103)" },
                5: { type: "morning", name: "320.S06 (Bus 91105)" },
                6: { type: "morning", name: "320.S08 (Bus 91103)" },
                7: { type: "morning", name: "320.S06 (Bus 91105)" },
                8: { type: "morning", name: "320.S08 (Bus 91103)" },
                9: { type: "off", name: "Abwesenheit (unbez.)" },
                11: { type: "morning", name: "320.S09 (Bus 91103)" },
                12: { type: "afternoon", name: "320.S05 (Bus 91104)" },
                13: { type: "morning", name: "320.S07 (Bus 91105)" },
                15: { type: "vacation", name: "Urlaub" },
                16: { type: "off", name: "Abwesenheit (unbez.)" },
                18: { type: "afternoon", name: "320.S05 (Bus 91103)" },
                19: { type: "afternoon", name: "320.S07 (Bus 91104)" },
                20: { type: "morning", name: "320.S09 (Bus 91105)" },
                21: { type: "afternoon", name: "320.S05 (Bus 91103)" },
                22: { type: "afternoon", name: "320.S07 (Bus 91104)" },
                24: { type: "morning", name: "320.701 (Bus 91103)" },
                26: { type: "afternoon", name: "320.S08 (Bus 91104)" },
                27: { type: "morning", name: "320.S06 (Bus 91103)" },
                28: { type: "afternoon", name: "320.S08 (Bus 91104)" },
                29: { type: "morning", name: "320.S06 (Bus 91103)" },
                30: { type: "vacation", name: "Urlaub" }
            };
            
            const shift = bobanShifts[day];
            if (shift) {
                shiftClass = shift.type;
                shiftName = shift.name;
            } else {
                shiftClass = "off";
                shiftName = t("shift_off");
            }
        } else if (isOnVacation) {
            shiftClass = "vacation";
            shiftName = t("shift_vacation");
        } else {
            const patternIndex = day % 5;
            if (patternIndex === 1 || patternIndex === 2) {
                shiftClass = "morning";
                shiftName = t("shift_morning");
            } else if (patternIndex === 3 || patternIndex === 4) {
                shiftClass = "afternoon";
                shiftName = t("shift_afternoon");
            } else {
                shiftClass = "off";
                shiftName = t("shift_off");
            }
        }
        
        div.innerHTML = `
            <span class="day-number">${day}</span>
            <div class="day-info ${shiftClass}" style="font-size:0.7rem; line-height:1.1; padding:2px;">${shiftName}</div>
        `;
        
        container.appendChild(div);
    }
}
export {
    renderTomorrowShiftForDriver,
    confirmTomorrowShift,
    renderDispatcherShiftsConfirmation,
    renderDriverCalendar
};
