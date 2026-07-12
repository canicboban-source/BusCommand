// BusCommand ESM v9.5
import { getVisibleDrivers, todayDateStr } from "../core/utils.js";
import { getGroupById } from "../data/groups.js";
import { dateToStr, getShiftForDriverDate } from "./shift-utils.js";
import { openShiftCell as _openShiftCell, removeShift as _removeShift } from "./shifts.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr as _changeAttr } from "../core/action-delegate.js";

function renderShiftsWeeklyGrid(weekDays) {
    const container = document.getElementById("shifts-weekly-grid");
    if (!container) return;

    // Filtriraj vozače po aktivnoj grupi
    const drivers = getVisibleDrivers().filter(d =>
        !window.state.activeGroupFilter || d.groupId === window.state.activeGroupFilter
    );

    if (drivers.length === 0) {
        container.innerHTML = `<p class="subtitle">${window.state.activeGroupFilter ? (t("no_drivers_in_group") || "Nema vozača u ovoj grupi") : t("no_drivers_registered")}</p>`;
        return;
    }

    // Koristi Intl.DateTimeFormat za nazive dana — automatski za sve jezike
    const lang = window.state.language || "en";
    const localeMap = {
        en: "en-GB", de: "de-AT", sr: "sr-Latn-RS",
        hr: "hr-HR", fr: "fr-FR", it: "it-IT",
        pl: "pl-PL", cs: "cs-CZ"
    };
    const locale = localeMap[lang] || "en-GB";
    // Generiši nazive dana (Mon–Sun) za tekuću nedelju
    const dayNames = Array.from({length: 7}, (_, i) => {
        const monday = new Date(2024, 0, 1); // poznati ponedeljak
        monday.setDate(1 + i);
        return monday.toLocaleDateString(locale, { weekday: "short" });
    });

    const shiftColors = {
        morning:   { bg: "rgba(14,165,233,0.18)", border: "rgba(14,165,233,0.5)", text: "#7dd3fc", icon: "🌅" },
        afternoon: { bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.5)", text: "#fcd34d", icon: "🌇" },
        night:     { bg: "rgba(139,92,246,0.18)", border: "rgba(139,92,246,0.5)", text: "#c4b5fd", icon: "🌙" },
        off:       { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.3)", icon: "💤" },
        vacation:  { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)", text: "#6ee7b7", icon: "🏖️" },
        sick:      { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)", text: "#fca5a5", icon: "🤒" },
        empty:     { bg: "transparent", border: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.15)", icon: "" }
    };

    const todayStr = todayDateStr();

    let html = `<table style="width:100%; border-collapse:separate; border-spacing:4px; min-width:700px;">
        <thead>
            <tr>
                <th style="text-align:left; padding:8px 12px; font-size:0.8rem; color:var(--text-muted); font-weight:600; min-width:130px;">${t("select_driver")}</th>`;

    weekDays.forEach((d, i) => {
        const dStr = dateToStr(d);
        const isToday = dStr === todayStr;
        html += `<th style="text-align:center; padding:8px 4px; font-size:0.75rem; color:${isToday ? "var(--primary-color)" : "var(--text-muted)"}; font-weight:${isToday ? "700" : "500"}; min-width:90px;">
            ${dayNames[i]}<br><span style="font-size:0.85rem; color:${isToday ? "var(--primary-color)" : "var(--text-main)"};">${d.getDate()}.${d.getMonth()+1}.</span>
        </th>`;
    });
    html += `</tr></thead><tbody>`;

    drivers.forEach(driver => {
        const driverGroup = getGroupById(driver.groupId);
        const avatarBg   = driverGroup ? driverGroup.color : "var(--primary-color)";
        html += `<tr>
            <td style="padding:6px 12px; font-size:0.85rem; font-weight:600; color:var(--text-main); vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:28px;height:28px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;">${driver.name.charAt(0)}</div>
                    <div>
                        <div>${driver.name.split(" ")[0]}</div>
                        ${driverGroup ? `<div style="font-size:9px;color:${driverGroup.color};font-weight:700;margin-top:1px;">${driverGroup.name}</div>` : ""}
                    </div>
                </div>
            </td>`;

        weekDays.forEach(d => {
            const dStr = dateToStr(d);
            const shift = getShiftForDriverDate(driver.name, dStr);
            const isToday = dStr === todayStr;
            const isPast  = dStr < todayStr;
            const style = shiftColors[shift ? shift.type : "empty"];

            html += `<td style="padding:3px;">
                <div style="background:${style.bg}; border:1px solid ${isToday ? "var(--primary-color)" : style.border};
                     border-radius:8px; padding:6px 4px; text-align:center; min-height:56px;
                     display:flex;flex-direction:column;align-items:center;justify-content:center;
                     position:relative; opacity:${isPast && !shift ? "0.4" : "1"}; cursor:pointer;
                     transition:all 0.15s ease;"
                     ${actionAttr("openShiftCell", [driver.name, dStr])}
                     onmouseenter="this.style.opacity='0.8'" onmouseleave="this.style.opacity='${isPast && !shift ? "0.4" : "1"}'">
                    ${shift ? `
                        <span style="font-size:1.1rem;">${style.icon}</span>
                        <span style="font-size:10px;font-weight:600;color:${style.text};margin-top:2px;line-height:1.2;">${shift.name || t("shift_"+shift.type) || shift.type}</span>
                        <button ${actionAttr("removeShift", [driver.name, dStr], { stopPropagation: true })}
                            style="position:absolute;top:2px;right:2px;background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:10px;padding:1px;line-height:1;"
                            title="${t("btn_delete")}">✕</button>
                    ` : `<span style="font-size:18px;color:rgba(255,255,255,0.1);">+</span>`}
                </div>
            </td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table>
    <div style="margin-top:12px; display:flex; gap:16px; flex-wrap:wrap;">
        ${Object.entries({morning:"🌅",afternoon:"🌇",night:"🌙",off:"💤",vacation:"🏖️",sick:"🤒"}).map(([k,ic]) =>
            `<span style="font-size:0.75rem; color:var(--text-muted);">${ic} ${t("shift_"+k) || k}</span>`
        ).join("")}
    </div>`;

    container.innerHTML = html;
}
export {
    renderShiftsWeeklyGrid
};
