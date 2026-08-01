const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const NON_WORKING_TYPES = new Set(["off", "vacation", "sick", "clear"]);

function splitListedValue(value, allowedValues = []) {
    const normalized = String(value || "").trim();
    const allowed = new Set(allowedValues.map(item => String(item)));
    return allowed.has(normalized)
        ? { selectValue: normalized, customValue: "" }
        : { selectValue: "", customValue: normalized };
}

function resolveMonthlyShiftTimes({ type, catalogEntry, existingShift } = {}) {
    if (NON_WORKING_TYPES.has(type)) {
        return { start: null, end: null, valid: true };
    }
    const start = catalogEntry?.start || existingShift?.start || null;
    const end = catalogEntry?.end || existingShift?.end || null;
    return {
        start,
        end,
        valid: TIME_RE.test(start || "") && TIME_RE.test(end || "")
    };
}

export { resolveMonthlyShiftTimes, splitListedValue };
