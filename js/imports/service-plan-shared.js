import { validateServicePlan } from "../../shared/service-plan-contract.mjs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DUTY_HEADERS = Object.freeze([
    "duty_code", "day_type", "work_start", "first_trip_start",
    "last_trip_end", "work_end", "start_location", "end_location"
]);
const ACTIVITY_HEADERS = Object.freeze([
    "duty_code", "sequence", "activity_type", "start", "end",
    "line", "course", "from", "to"
]);
const ACCEPTED_EXTENSIONS = Object.freeze([".xlsx", ".csv", ".pdf"]);

function clean(value) {
    return String(value ?? "").trim();
}

function extensionOf(fileName) {
    const name = String(fileName || "").toLowerCase();
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot) : "";
}

function validateServicePlanFile(file) {
    if (!file) return "ca_plan_err_file_required";
    const ext = extensionOf(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        return "ca_plan_err_file_type";
    }
    if (file.size > MAX_FILE_BYTES) return "ca_plan_err_file_too_large";
    return null;
}

function buildServicePlanInput({ metadata, dutyRows, activityRows }) {
    return {
        templateVersion: clean(metadata.templateVersion || metadata.template_version),
        planCode: clean(metadata.planCode || metadata.plan_code),
        planVersion: clean(metadata.planVersion || metadata.plan_version),
        validFrom: clean(metadata.validFrom || metadata.valid_from),
        timezone: clean(metadata.timezone),
        duties: (dutyRows || []).map(row => ({
            code: clean(row.duty_code || row.code),
            dayType: clean(row.day_type || row.dayType),
            workStart: clean(row.work_start || row.workStart),
            firstTripStart: clean(row.first_trip_start || row.firstTripStart),
            lastTripEnd: clean(row.last_trip_end || row.lastTripEnd),
            workEnd: clean(row.work_end || row.workEnd),
            startLocation: clean(row.start_location || row.startLocation),
            endLocation: clean(row.end_location || row.endLocation)
        })),
        activities: (activityRows || []).map(row => ({
            dutyCode: clean(row.duty_code || row.dutyCode),
            sequence: Number(row.sequence),
            type: clean(row.activity_type || row.type || row.activityType),
            start: clean(row.start),
            end: clean(row.end),
            line: clean(row.line),
            course: clean(row.course),
            from: clean(row.from),
            to: clean(row.to)
        }))
    };
}

function validateBuiltPlan(parts) {
    return validateServicePlan(buildServicePlanInput(parts));
}

export {
    ACCEPTED_EXTENSIONS,
    ACTIVITY_HEADERS,
    DUTY_HEADERS,
    MAX_FILE_BYTES,
    buildServicePlanInput,
    clean,
    extensionOf,
    validateBuiltPlan,
    validateServicePlanFile
};
