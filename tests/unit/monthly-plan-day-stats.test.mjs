import test from "node:test";
import assert from "node:assert/strict";
import {
    countMonthlyPlanDayStats,
    pickCountKey
} from "../../shared/monthly-plan-day-stats.mjs";

test("vacation and sick count as assigned days, not work days", () => {
    const stats = countMonthlyPlanDayStats({
        1: { type: "vacation", name: "Vacation" },
        2: { type: "sick", name: "Sick" },
        3: { type: "off", name: "Frei" },
        4: { type: "morning", name: "101.S01" }
    });
    assert.deepEqual(stats, { assignedDays: 3, workDays: 1 });
});

test("single vacation is one assigned day (fixes false work-days label)", () => {
    const stats = countMonthlyPlanDayStats({
        3: { type: "vacation", name: "Vacation" }
    });
    assert.equal(stats.assignedDays, 1);
    assert.equal(stats.workDays, 0);
    assert.equal(
        pickCountKey(stats.assignedDays, "monthly_summary_assigned_one", "monthly_summary_assigned_other"),
        "monthly_summary_assigned_one"
    );
});

test("empty and clear days are ignored", () => {
    assert.deepEqual(
        countMonthlyPlanDayStats({
            1: { type: "off" },
            2: { type: "clear" },
            3: null
        }),
        { assignedDays: 0, workDays: 0 }
    );
});

test("plural key switches at count === 1", () => {
    assert.equal(pickCountKey(0, "one", "other"), "other");
    assert.equal(pickCountKey(1, "one", "other"), "one");
    assert.equal(pickCountKey(2, "one", "other"), "other");
});

test("EN/SR/DE expose monthly_edit_day and assigned-day summary keys", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
    const source = readFileSync(join(root, "translations.js"), "utf8");
    const context = { window: {} };
    const vm = await import("node:vm");
    vm.runInNewContext(source, context);
    for (const lang of ["en", "sr", "de"]) {
        const dict = context.window.TRANSLATIONS[lang];
        assert.ok(dict.monthly_edit_day, `${lang}.monthly_edit_day`);
        assert.notEqual(dict.monthly_edit_day, "monthly_edit_day");
        assert.match(dict.monthly_summary_assigned_one, /\{days\}/);
        assert.match(dict.monthly_summary_assigned_other, /\{days\}/);
        assert.doesNotMatch(dict.monthly_summary_assigned_one, /work days|radnih dana|Arbeitstage/i);
    }
    assert.equal(context.window.TRANSLATIONS.en.monthly_edit_day, "Edit day");
    assert.equal(context.window.TRANSLATIONS.sr.monthly_edit_day, "Uredi dan");
    assert.equal(context.window.TRANSLATIONS.de.monthly_edit_day, "Tag bearbeiten");
    for (const key of [
        "monthly_below_entry_hint",
        "monthly_below_empty_days",
        "monthly_below_no_problems"
    ]) {
        for (const lang of ["en", "sr", "de"]) {
            assert.ok(context.window.TRANSLATIONS[lang][key], `${lang}.${key}`);
            assert.notEqual(context.window.TRANSLATIONS[lang][key], key);
        }
    }
});
