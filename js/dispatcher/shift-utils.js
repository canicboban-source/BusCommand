// BusCommand ESM v9.5 — delegira na shift-plan.js (jedan izvor istine)
import { renderDispatcherShifts } from "./shifts.js";
import {
    dateToStr,
    getCurrentShiftForDriver,
    getShiftForDriverDate,
    getShiftForDriverIdOnly
} from "../core/shift-plan.js";

function getWeekDates(offset) {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
    }
    return days;
}

function shiftWeekNav(direction) {
    if (direction === 0) window.currentShiftWeekOffset = 0;
    else window.currentShiftWeekOffset += direction;
    renderDispatcherShifts();
}

export {
    getWeekDates,
    dateToStr,
    shiftWeekNav,
    getShiftForDriverDate,
    getShiftForDriverIdOnly,
    getCurrentShiftForDriver
};
