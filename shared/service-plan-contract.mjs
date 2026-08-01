const TEMPLATE_VERSION = "BUSCOMMAND-DIENSTPLAN-1";
const MAX_DUTIES = 400;
const MAX_ACTIVITIES = 12000;
const ACTIVITY_TYPES = new Set([
    "ARBEIT", "DEPOT", "FAHRT", "TRANS", "PAUSE", "RUHE", "SONSTIGES"
]);
const DAY_TYPES = new Set([
    "SCHOOL_WEEKDAY", "HOLIDAY_WEEKDAY", "SATURDAY", "SUNDAY_HOLIDAY", "ALL_DAYS"
]);

function text(value, max = 160) {
    return String(value ?? "").trim().slice(0, max);
}

function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIanaTimezone(value) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
        return value.includes("/");
    } catch {
        return false;
    }
}

function parseClock(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(text(value, 5));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
}

function unfoldTimes(values) {
    const result = [];
    let previous = null;
    let dayOffset = 0;
    for (const value of values) {
        const minute = parseClock(value);
        if (minute == null) return null;
        let absolute = minute + dayOffset * 1440;
        if (previous != null && absolute < previous) {
            dayOffset += 1;
            absolute += 1440;
        }
        result.push({ clock: text(value, 5), absolute, dayOffset });
        previous = absolute;
    }
    return result;
}

function addError(errors, path, code, message) {
    errors.push({ path, code, message });
}

function normalizeActivity(raw, dutyCode, index, errors) {
    const path = `activities[${index}]`;
    const activityDutyCode = text(raw?.dutyCode || raw?.duty_code, 40).toUpperCase();
    const type = text(raw?.type || raw?.activityType || raw?.activity_type, 20).toUpperCase();
    const sequence = Number(raw?.sequence);
    const start = text(raw?.start, 5);
    const end = text(raw?.end, 5);

    if (activityDutyCode !== dutyCode) {
        addError(errors, `${path}.dutyCode`, "duty_mismatch", "Aktivnost nije povezana sa odgovarajućom smenom.");
    }
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
        addError(errors, `${path}.sequence`, "invalid_sequence", "Redni broj aktivnosti mora biti ceo broj 1-999.");
    }
    if (!ACTIVITY_TYPES.has(type)) {
        addError(errors, `${path}.type`, "invalid_activity_type", "Nepoznat tip aktivnosti.");
    }
    if (parseClock(start) == null) addError(errors, `${path}.start`, "invalid_time", "Vreme mora biti HH:MM.");
    if (parseClock(end) == null) addError(errors, `${path}.end`, "invalid_time", "Vreme mora biti HH:MM.");

    return {
        dutyCode,
        sequence,
        type,
        start,
        end,
        line: text(raw?.line, 20),
        course: text(raw?.course, 30),
        from: text(raw?.from, 160),
        to: text(raw?.to, 160)
    };
}

function normalizeDuty(raw, index, allActivities, errors) {
    const path = `duties[${index}]`;
    const code = text(raw?.code || raw?.dutyCode || raw?.duty_code, 40).toUpperCase();
    const dayType = text(raw?.dayType || raw?.day_type, 30).toUpperCase();
    const workStart = text(raw?.workStart || raw?.work_start, 5);
    const firstTripStart = text(raw?.firstTripStart || raw?.first_trip_start, 5);
    const lastTripEnd = text(raw?.lastTripEnd || raw?.last_trip_end, 5);
    const workEnd = text(raw?.workEnd || raw?.work_end, 5);

    if (!/^[A-Z0-9]+\.[A-Z0-9]+$/.test(code)) {
        addError(errors, `${path}.code`, "invalid_duty_code", "Šifra smene mora biti oblika 310.S01.");
    }
    if (!DAY_TYPES.has(dayType)) {
        addError(errors, `${path}.dayType`, "invalid_day_type", "Nepoznat tip dana.");
    }

    const timeline = unfoldTimes([workStart, firstTripStart, lastTripEnd, workEnd]);
    if (!timeline) {
        addError(errors, path, "invalid_timeline", "Sva vremena smene moraju biti u formatu HH:MM.");
    } else {
        const duration = timeline[3].absolute - timeline[0].absolute;
        if (duration <= 0 || duration > 24 * 60) {
            addError(errors, path, "invalid_duration", "Smena mora trajati više od 0 i najviše 24 sata.");
        }
    }

    const activityRows = allActivities
        .filter(activity => text(activity?.dutyCode || activity?.duty_code, 40).toUpperCase() === code)
        .map((activity, activityIndex) => normalizeActivity(activity, code, activityIndex, errors))
        .sort((a, b) => a.sequence - b.sequence);

    if (!activityRows.length) {
        addError(errors, `${path}.activities`, "activities_required", "Svaka smena mora imati najmanje jednu aktivnost.");
    } else {
        const sequences = new Set();
        activityRows.forEach(activity => {
            if (sequences.has(activity.sequence)) {
                addError(errors, `${path}.activities`, "duplicate_sequence", "Redni brojevi aktivnosti moraju biti jedinstveni.");
            }
            sequences.add(activity.sequence);
        });

        const activityTimeline = [];
        activityRows.forEach(activity => activityTimeline.push(activity.start, activity.end));
        const unfolded = unfoldTimes(activityTimeline);
        if (!unfolded) {
            addError(errors, `${path}.activities`, "invalid_activity_time", "Aktivnosti sadrže nevalidno vreme.");
        } else {
            for (let i = 0; i < unfolded.length; i += 2) {
                if (unfolded[i + 1].absolute < unfolded[i].absolute) {
                    addError(errors, `${path}.activities`, "negative_activity", "Kraj aktivnosti ne može biti pre njenog početka.");
                    break;
                }
                if (i > 0 && unfolded[i].absolute < unfolded[i - 1].absolute) {
                    addError(errors, `${path}.activities`, "activity_overlap", "Aktivnosti moraju biti hronološki poređane bez preklapanja.");
                    break;
                }
                if (i > 0 && unfolded[i].absolute !== unfolded[i - 1].absolute) {
                    addError(errors, `${path}.activities`, "activity_gap", "Aktivnosti moraju pokriti celu smenu bez praznina ili preklapanja.");
                    break;
                }
            }

            const summary = unfoldTimes([workStart, firstTripStart, lastTripEnd, workEnd]);
            const trips = activityRows
                .map((activity, i) => ({ activity, start: unfolded[i * 2], end: unfolded[i * 2 + 1] }))
                .filter(item => item.activity.type === "FAHRT");
            if (!trips.length) {
                addError(errors, `${path}.activities`, "trip_required", "Smena mora sadržati najmanje jednu FAHRT aktivnost.");
            } else if (summary) {
                if (unfolded[0].clock !== workStart || unfolded.at(-1).clock !== workEnd) {
                    addError(errors, `${path}.activities`, "work_bounds_mismatch", "Prva i poslednja aktivnost moraju odgovarati početku i kraju smene.");
                }
                if (trips[0].start.clock !== firstTripStart || trips.at(-1).end.clock !== lastTripEnd) {
                    addError(errors, `${path}.activities`, "trip_bounds_mismatch", "Prva i poslednja FAHRT aktivnost moraju odgovarati sažetku smene.");
                }
                const activityDuration = unfolded.at(-1).absolute - unfolded[0].absolute;
                const summaryDuration = summary[3].absolute - summary[0].absolute;
                if (activityDuration !== summaryDuration) {
                    addError(errors, `${path}.activities`, "activity_duration_mismatch", "Tok aktivnosti mora trajati jednako kao cela smena.");
                }
            }
        }
    }

    return {
        code,
        dayType,
        workStart,
        firstTripStart,
        lastTripEnd,
        workEnd,
        endDayOffset: timeline?.[3]?.dayOffset || 0,
        startLocation: text(raw?.startLocation || raw?.start_location, 160),
        endLocation: text(raw?.endLocation || raw?.end_location, 160),
        activities: activityRows
    };
}

function validateServicePlan(input) {
    const errors = [];
    const raw = input && typeof input === "object" ? input : {};
    const templateVersion = text(raw.templateVersion || raw.template_version, 60).toUpperCase();
    const planCode = text(raw.planCode || raw.plan_code, 30).toUpperCase();
    const planVersion = text(raw.planVersion || raw.plan_version, 30);
    const validFrom = text(raw.validFrom || raw.valid_from, 10);
    const timezone = text(raw.timezone, 80);
    const rawDuties = Array.isArray(raw.duties) ? raw.duties : [];
    const rawActivities = Array.isArray(raw.activities)
        ? raw.activities
        : rawDuties.flatMap(duty => Array.isArray(duty?.activities) ? duty.activities : []);

    if (templateVersion !== TEMPLATE_VERSION) {
        addError(errors, "templateVersion", "unsupported_template", `Podržan je samo šablon ${TEMPLATE_VERSION}.`);
    }
    if (!/^[A-Z0-9_-]{1,30}$/.test(planCode)) {
        addError(errors, "planCode", "invalid_plan_code", "Oznaka plana mora sadržati samo slova, brojeve, _ ili -.");
    }
    if (!planVersion) addError(errors, "planVersion", "version_required", "Verzija plana je obavezna.");
    if (!isIsoDate(validFrom)) addError(errors, "validFrom", "invalid_date", "Datum važenja mora biti YYYY-MM-DD.");
    if (!isIanaTimezone(timezone)) addError(errors, "timezone", "invalid_timezone", "Vremenska zona mora biti IANA naziv, npr. Europe/Vienna.");
    if (!rawDuties.length) addError(errors, "duties", "duties_required", "Plan mora sadržati najmanje jednu smenu.");
    if (rawDuties.length > MAX_DUTIES) addError(errors, "duties", "too_many_duties", `Dozvoljeno je najviše ${MAX_DUTIES} smena.`);
    if (rawActivities.length > MAX_ACTIVITIES) addError(errors, "activities", "too_many_activities", `Dozvoljeno je najviše ${MAX_ACTIVITIES} aktivnosti.`);

    const duties = rawDuties.map((duty, index) => normalizeDuty(duty, index, rawActivities, errors));
    const seenCodes = new Set();
    duties.forEach((duty, index) => {
        if (seenCodes.has(duty.code)) addError(errors, `duties[${index}].code`, "duplicate_duty", "Šifra smene mora biti jedinstvena.");
        seenCodes.add(duty.code);
        if (planCode && !duty.code.startsWith(`${planCode}.`)) {
            addError(errors, `duties[${index}].code`, "wrong_plan_prefix", `Šifra smene mora početi sa ${planCode}.`);
        }
    });
    rawActivities.forEach((activity, index) => {
        const code = text(activity?.dutyCode || activity?.duty_code, 40).toUpperCase();
        if (!seenCodes.has(code)) addError(errors, `activities[${index}].dutyCode`, "unknown_duty", "Aktivnost upućuje na nepostojeću smenu.");
    });

    const normalized = {
        templateVersion: TEMPLATE_VERSION,
        planCode,
        planVersion,
        validFrom,
        timezone,
        duties
    };

    return {
        valid: errors.length === 0,
        errors,
        plan: normalized,
        summary: {
            dutyCount: duties.length,
            activityCount: duties.reduce((sum, duty) => sum + duty.activities.length, 0),
            earliestWorkStart: duties.map(duty => duty.workStart).sort()[0] || null,
            overnightDutyCount: duties.filter(duty => duty.endDayOffset > 0).length
        }
    };
}

export {
    ACTIVITY_TYPES,
    DAY_TYPES,
    MAX_ACTIVITIES,
    MAX_DUTIES,
    TEMPLATE_VERSION,
    isIanaTimezone,
    parseClock,
    unfoldTimes,
    validateServicePlan
};
