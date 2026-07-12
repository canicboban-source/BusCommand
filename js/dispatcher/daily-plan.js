// BusCommand — dnevni plan (poz. 1 = x2 Bereitschaft)
import { getDailyPlanForDate, getActiveBereitschaftCode } from "../core/shift-plan.js";
import { todayDateStr } from "../core/utils.js";
import { getGroupById } from "../data/groups.js";
import { t } from "../ui/i18n.js";

function getActiveHubGroupId() {
    return window.state.activeGroupHubId || null;
}

function getDailyPlanDateInput() {
    return document.getElementById("daily-plan-date-picker")
        || document.getElementById("schedule-date-picker");
}

function buildDailyPlanTable(slots, { compact = false } = {}) {
    if (!slots.length) return "";

    const fontSize = compact ? "0.78rem" : "0.9rem";
    const pad = compact ? "6px 8px" : "10px 12px";

    return `
        <table style="width:100%;border-collapse:collapse;font-size:${fontSize};">
            <thead>
                <tr style="color:var(--text-muted);text-align:left;border-bottom:1px solid rgba(255,255,255,0.08);">
                    <th style="padding:${pad};width:48px;">${t("daily_col_pos")}</th>
                    <th style="padding:${pad};">${t("daily_col_shift")}</th>
                    <th style="padding:${pad};">${t("daily_col_driver")}</th>
                    <th style="padding:${pad};">${t("daily_col_time")}</th>
                </tr>
            </thead>
            <tbody>
                ${slots.map(slot => {
                    const isBr = slot.position === 1 && slot.type === "bereitschaft";
                    const rowBg = isBr ? "rgba(245,158,11,0.08)" : "transparent";
                    const codeLabel = slot.shortName ? `${slot.code} (${slot.shortName})` : (slot.code || slot.name);
                    const time = slot.start && slot.end ? `${slot.start}–${slot.end}` : "—";
                    return `<tr style="background:${rowBg};border-bottom:1px solid rgba(255,255,255,0.04);">
                        <td style="padding:${pad};font-weight:700;color:${isBr ? "#f59e0b" : "var(--text-main)"};">${slot.position}</td>
                        <td style="padding:${pad};">${codeLabel}</td>
                        <td style="padding:${pad};font-weight:600;">${slot.driverName || "—"}</td>
                        <td style="padding:${pad};color:var(--text-muted);">${time}</td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>`;
}

function renderDailyPlanMeta(plan, metaEl, { full = false } = {}) {
    if (!metaEl) return;
    const brCode = getActiveBereitschaftCode() || "X2";
    const driver = plan.bereitschaftDriver || "—";

    if (plan.isWeekday) {
        const key = full ? "daily_pos1_meta_full" : "daily_pos1_meta";
        const replacements = { code: brCode, driver };
        if (full) replacements.total = plan.slots.length;
        metaEl.innerHTML = t(key, replacements);
    } else {
        const key = full ? "daily_weekend_meta_full" : "daily_weekend_meta";
        metaEl.innerHTML = full
            ? t(key, { total: plan.slots.length })
            : t(key);
    }
}

function renderDailyPlanPanel(dateStr) {
    const container = document.getElementById("daily-plan-slots");
    const metaEl = document.getElementById("daily-plan-meta");
    if (!container) return;

    const date = dateStr || getDailyPlanDateInput()?.value || todayDateStr();
    const plan = getDailyPlanForDate(date);

    renderDailyPlanMeta(plan, metaEl);

    if (!plan.slots.length) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px;">${t("daily_no_shifts", { date })}</p>`;
        return;
    }

    container.innerHTML = buildDailyPlanTable(plan.slots);
}

function renderDailyPlanFullPage() {
    const container = document.getElementById("daily-plan-full-slots");
    const metaEl = document.getElementById("daily-plan-full-meta");
    const subtitle = document.getElementById("daily-full-subtitle");
    const picker = document.getElementById("daily-plan-date-picker");

    if (!container) return;

    if (picker && !picker.value) {
        picker.value = todayDateStr();
    }

    const groupId = getActiveHubGroupId();
    const group = groupId ? getGroupById(groupId) : null;
    if (subtitle && group) {
        subtitle.textContent = t("daily_full_subtitle", { name: group.name, id: group.id });
    }

    const date = picker?.value || todayDateStr();
    const plan = getDailyPlanForDate(date);
    renderDailyPlanMeta(plan, metaEl, { full: true });

    if (!plan.slots.length) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.95rem;padding:24px;text-align:center;">${t("daily_no_shifts_full", { date })}</p>`;
        return;
    }

    container.innerHTML = buildDailyPlanTable(plan.slots);
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function bindDailyPlanFullPage() {
    const picker = document.getElementById("daily-plan-date-picker");
    if (picker && !picker.dataset.fullPageBound) {
        picker.dataset.fullPageBound = "1";
        picker.addEventListener("change", () => renderDailyPlanFullPage());
    }
}

function renderHubDailyPreview() {
    const el = document.getElementById("hub-daily-preview");
    const dateLabel = document.getElementById("hub-daily-date-label");
    if (!el) return;

    const date = todayDateStr();
    if (dateLabel) {
        const d = new Date(`${date}T12:00:00`);
        const lang = window.state.language || "en";
        dateLabel.textContent = d.toLocaleDateString(lang === "sr" ? "sr-RS" : lang, {
            weekday: "short",
            day: "numeric",
            month: "short"
        });
    }

    const plan = getDailyPlanForDate(date);
    if (!plan.slots.length) {
        el.innerHTML = `<p style="color:var(--text-muted);margin:0;">${t("daily_no_shifts_today")}</p>`;
        return;
    }

    const preview = plan.slots.slice(0, 4);
    const more = plan.slots.length > 4
        ? `<p style="margin:8px 0 0;color:var(--text-muted);font-size:0.75rem;">${t("hub_monthly_more", { count: plan.slots.length - 4 })}</p>`
        : "";

    el.innerHTML = buildDailyPlanTable(preview, { compact: true }) + more;
}

function refreshDailyPlanOnDateChange() {
    const picker = document.getElementById("schedule-date-picker");
    if (picker && !picker.dataset.dailyPlanBound) {
        picker.dataset.dailyPlanBound = "1";
        picker.addEventListener("change", () => renderDailyPlanPanel(picker.value));
    }
    renderDailyPlanPanel(picker?.value);
}

export {
    renderDailyPlanPanel,
    renderDailyPlanFullPage,
    renderHubDailyPreview,
    bindDailyPlanFullPage,
    refreshDailyPlanOnDateChange
};
