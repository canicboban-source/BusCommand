// BusCommand ESM v9.5
import { getScheduleByKey, showToast } from "../core/utils.js";
import { getShiftForDriverDate, getTomorrowDutySummary } from "../core/shift-plan.js";
import { saveState } from "../core/state.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { t } from "../ui/i18n.js";
import { driverWorkPolicy, confirmUpcomingShifts } from "./work-session.js";

const VALID_SHIFT_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft", "off", "vacation", "sick"]);

function currentDriver() {
    if (!window.currentUser || window.currentUser.role !== "driver") return null;
    return {
        id: window.currentUser.id || window.currentUser.uid || "",
        name: window.currentUser.name || ""
    };
}

function activeCalendarMonth() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(window.currentCalendarMonth || "")) {
        window.currentCalendarMonth = new Date().toISOString().slice(0, 7);
    }
    return window.currentCalendarMonth;
}

function scheduleForDriver(driver, month) {
    const schedules = window.state.schedules || [];
    return schedules.find(schedule => schedule.month === month && schedule.driverId && schedule.driverId === driver.id)
        || getScheduleByKey(`${driver.name}_${month}`)
        || null;
}

function approvedVacationOn(driver, date) {
    return (window.state.vacations || []).some(vacation =>
        (vacation.driverId ? vacation.driverId === driver.id : vacation.driver === driver.name)
        && ["approved", "Odobreno"].includes(vacation.status)
        && date >= vacation.start && date <= vacation.end
    );
}

function translatedShiftName(shift) {
    if (!shift) return t("no_data");
    if (shift.type === "off") return t("shift_off");
    if (shift.type === "vacation") return t("shift_vacation");
    if (shift.type === "sick") return t("shift_type_sick");
    return shift.routeCode || shift.name || t(`shift_${shift.type}`) || t("no_data");
}

function appendCalendarDay(container, day, date, shift, isToday) {
    const cell = document.createElement("div");
    const type = VALID_SHIFT_TYPES.has(shift?.type) ? shift.type : "off";
    cell.className = `calendar-day${isToday ? " today" : ""}`;
    cell.dataset.date = date;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `${date}: ${translatedShiftName(shift)}`);

    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = String(day);
    const info = document.createElement("div");
    info.className = `day-info ${type}`;
    info.style.fontSize = "0.7rem";
    info.style.lineHeight = "1.2";
    info.style.padding = "3px";
    info.textContent = translatedShiftName(shift);
    cell.append(number, info);
    container.appendChild(cell);
}

function renderDriverCalendar() {
    const container = document.getElementById("calendar-days-container");
    const driver = currentDriver();
    if (!container || !driver) return;
    container.replaceChildren();

    const month = activeCalendarMonth();
    const [year, monthNumber] = month.split("-").map(Number);
    const totalDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
    const offset = firstWeekday === 0 ? 6 : firstWeekday - 1;
    const today = new Date().toISOString().slice(0, 10);
    const language = window.state.language || "sr";

    const heading = document.getElementById("calendar-month-year");
    if (heading) {
        heading.textContent = new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" })
            .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
    }

    const schedule = scheduleForDriver(driver, month);
    const downloadCard = document.getElementById("driver-schedule-download-card");
    const filenameLabel = document.getElementById("driver-schedule-filename");
    const hasDocument = Boolean(schedule?.fileData && schedule?.fileName);
    if (downloadCard) downloadCard.style.display = hasDocument ? "flex" : "none";
    if (filenameLabel && hasDocument) filenameLabel.textContent = schedule.fileName;

    for (let index = 0; index < offset; index++) {
        const empty = document.createElement("div");
        empty.className = "calendar-day empty-day";
        empty.setAttribute("aria-hidden", "true");
        container.appendChild(empty);
    }

    for (let day = 1; day <= totalDays; day++) {
        const date = `${month}-${String(day).padStart(2, "0")}`;
        let shift = getShiftForDriverDate(driver.name, date);
        if (approvedVacationOn(driver, date)) shift = { type: "vacation" };
        appendCalendarDay(container, day, date, shift, date === today);
    }
}

function renderTomorrowShiftForDriver() {
    const container = document.getElementById("driver-next-shift-container");
    const driver = currentDriver();
    if (!container || !driver) return;
    container.replaceChildren();
    const targets = !USE_LOCAL_STATE ? (driverWorkPolicy()?.confirmationTargets || []) : [];
    if (targets.length) {
        const heading = document.createElement("strong");
        heading.textContent = t("upcoming_shifts_confirmation_title");
        const list = document.createElement("div");
        list.className = "driver-shift-confirmation-list";
        targets.forEach((target) => {
            const row = document.createElement("div");
            row.className = "driver-shift-confirmation-row";
            row.dataset.requestId = target.requestId || target.date;
            const label = document.createElement("span");
            const dayLabel = target.label && target.label !== "next_shift"
                ? t(`confirm_label_${target.label}`)
                : t("confirm_label_next_shift");
            label.textContent = `${dayLabel} · ${target.date} · ${target.name || target.routeCode || t(`shift_${target.type}`)} · ${target.start}–${target.end}`;
            const status = document.createElement("strong");
            status.textContent = target.confirmed ? t("status_confirmed") : t("js_status_pending");
            status.className = target.confirmed ? "text-success" : "text-warning";
            row.append(label, status);
            if (!target.confirmed) {
                const one = document.createElement("button");
                one.type = "button";
                one.className = "btn-secondary btn-sm";
                one.textContent = t("btn_confirm_shift");
                one.addEventListener("click", async () => {
                    one.disabled = true;
                    await confirmUpcomingShifts([target.date]);
                    renderTomorrowShiftForDriver();
                });
                row.appendChild(one);
            }
            list.appendChild(row);
        });
        container.append(heading, list);
        if (targets.some((target) => !target.confirmed)) {
            const button = document.createElement("button");
            button.className = "btn-primary";
            button.textContent = t("confirm_all_shifts");
            button.addEventListener("click", async () => {
                button.disabled = true;
                await confirmUpcomingShifts();
                renderTomorrowShiftForDriver();
            });
            container.appendChild(button);
        }
        return;
    }

    const summary = getTomorrowDutySummary(driver.name);
    const wrapper = document.createElement("div");
    wrapper.className = "driver-next-shift-summary";
    const title = document.createElement("strong");
    title.textContent = summary.type === "off" ? t("no_shift_tomorrow") : summary.shift;
    const details = document.createElement("span");
    details.textContent = summary.type === "off" ? summary.date : `${summary.date} · ${t("vehicle")}: ${summary.bus}`;
    wrapper.append(title, details);
    container.appendChild(wrapper);
}

async function confirmTomorrowShift(driverName) {
    if (!window.currentUser || window.currentUser.role !== "driver" || driverName !== window.currentUser.name) return;
    if (!USE_LOCAL_STATE) {
        await confirmUpcomingShifts();
        renderTomorrowShiftForDriver();
        return;
    }
    const shift = (window.state.tomorrowShifts || []).find(item => item.driver === driverName);
    if (!shift) return;
    shift.confirmed = true;
    saveState();
    renderTomorrowShiftForDriver();
    showToast(t("status_confirmed"), "success", 3000);
}

function renderDispatcherShiftsConfirmation() {
    const container = document.getElementById("dispatcher-confirm-shifts-list");
    if (!container) return;
    container.replaceChildren();
    (window.state.tomorrowShifts || []).forEach(shift => {
        const row = document.createElement("div");
        row.className = "confirm-shift-item";
        row.textContent = `${shift.driver || "—"} · ${shift.shift || "—"} · ${shift.bus || "—"}`;
        container.appendChild(row);
    });
}

export {
    activeCalendarMonth,
    approvedVacationOn,
    scheduleForDriver,
    renderTomorrowShiftForDriver,
    confirmTomorrowShift,
    renderDispatcherShiftsConfirmation,
    renderDriverCalendar
};
