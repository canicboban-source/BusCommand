import { TEMPLATE_VERSION } from "../../shared/service-plan-contract.mjs";
import { clean, validateBuiltPlan } from "./service-plan-shared.js";

const MARKER = TEMPLATE_VERSION;
const START_MARKER = `BUSCOMMAND-DIENSTPLAN-START ${MARKER}`;
const END_MARKER = `BUSCOMMAND-DIENSTPLAN-END ${MARKER}`;

const DAY_SECTION_RE = /(Montag\s*[-–]\s*Freitag|Samstag(?:\s*\(Werktag\))?|Sonn-?\s*und\s*Feiertag|Sonntag(?:\s*und\s*Feiertag)?|\bSa\b(?!\w))/gi;
const TIME_TOKEN_RE = /\b(\d{1,2})\.(\d{2})\b/g;
// Kursnummer must be a standalone 3-digit token (not the MM of 6.22, not the tail of hi200).
const COURSE_BLOCK_RE = /(?<![A-Za-z0-9.])(\d{3})\s+((?:\d{1,2}\.\d{2}(?:\s+|\s*$))+)/g;
const COMPANY_DUTY_RE = /Dienst\s+(\d{2,4}\.[A-Za-z0-9]+)/gi;
const COMPANY_ACTIVITY_RE = /(\d{1,3})\s+(Arbeit|Depot|Trans|Ruhe|P|\d{2,4})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/gi;
// pdf.js may emit Version glyphs as "6 6" / "09 . 0 2 .202 6" — accept spaced digits.
const COMPANY_VERSION_RE = /Version\s+([\d\s]+?)\s+ab\s+([\d\s]+?)\s*\.\s*([\d\s]+?)\s*\.\s*([\d\s]{4,})/i;
/** Machine-readable fallback only — UI localizes via ca_plan_err_* keys. */
const UNSUPPORTED_PDF_MESSAGE = "ca_plan_err_unsupported_pdf";

function compactDigitSpaces(value) {
    return String(value || "").replace(/\s+/g, "");
}

/**
 * Join pdf.js text items using geometry so adjacent glyphs (e.g. Version "6""6")
 * are not force-spaced into "6 6".
 */
function joinPdfTextItems(items) {
    let lastY = null;
    let lastEndX = null;
    let lastFontSize = 10;
    const parts = [];
    for (const item of items || []) {
        const str = item?.str || "";
        if (!str) continue;
        const transform = item.transform || null;
        const x = transform ? transform[4] : null;
        const y = transform ? transform[5] : null;
        const fontSize = transform && transform[0] != null
            ? Math.abs(transform[0]) || lastFontSize
            : lastFontSize;
        const width = typeof item.width === "number" ? item.width : 0;

        if (lastY != null && y != null && Math.abs(lastY - y) > Math.max(2, fontSize * 0.35)) {
            parts.push("\n");
            lastEndX = null;
        } else if (parts.length) {
            const prev = parts[parts.length - 1];
            const prevEndsSpace = /\s$/.test(prev);
            const curStartsSpace = /^\s/.test(str);
            if (!prevEndsSpace && !curStartsSpace) {
                const gap = x != null && lastEndX != null ? x - lastEndX : Number.POSITIVE_INFINITY;
                if (gap > Math.max(1.2, fontSize * 0.12)) {
                    parts.push(" ");
                }
            }
        }

        parts.push(str);
        if (y != null) lastY = y;
        if (x != null) lastEndX = x + width;
        lastFontSize = fontSize;
    }
    return parts.join("");
}

function decodePdfField(value) {
    return clean(String(value ?? "").replace(/~/g, " "));
}

function encodePdfField(value) {
    const text = clean(value);
    return text ? text.replace(/\s+/g, "~") : "";
}

function toHhMm(hour, minute) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeClockToken(token) {
    const match = /^(\d{1,2})\.(\d{2})$/.exec(clean(token));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return toHhMm(hour, minute);
}

function normalizeColonClock(token) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(clean(token));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return toHhMm(hour, minute);
}

function mapDayType(label) {
    const text = clean(label).toLowerCase();
    if (text.includes("samstag") || text === "sa") return "SATURDAY";
    if (text.includes("sonn") || text.includes("feiertag")) return "SUNDAY_HOLIDAY";
    if (text.includes("montag") || text.includes("freitag")) return "SCHOOL_WEEKDAY";
    return null;
}

function mapCompanyDutyDayType(dutyCode) {
    const suffix = String(dutyCode || "").split(".")[1] || "";
    if (/^S/i.test(suffix)) return "SCHOOL_WEEKDAY";
    if (/^F/i.test(suffix)) return "HOLIDAY_WEEKDAY";
    if (/^6/.test(suffix)) return "SATURDAY";
    if (/^7/.test(suffix)) return "SUNDAY_HOLIDAY";
    return null;
}

function mapCompanyActivityType(token) {
    const text = clean(token);
    if (/^arbeit$/i.test(text)) return "ARBEIT";
    if (/^depot$/i.test(text)) return "DEPOT";
    if (/^trans$/i.test(text)) return "TRANS";
    if (/^ruhe$/i.test(text)) return "RUHE";
    if (/^p$/i.test(text)) return "PAUSE";
    if (/^\d{2,4}$/.test(text)) return "FAHRT";
    return "SONSTIGES";
}

function looksLikePublicFahrplan(text) {
    const raw = String(text || "");
    if (!raw.trim()) return false;
    if (/Kursnummer/i.test(raw) && /Gültig ab/i.test(raw)) return true;
    if (/Betreiber:/i.test(raw) && /Gültig ab/i.test(raw) && TIME_TOKEN_RE.test(raw)) return true;
    return false;
}

function looksLikeCompanyDienstplan(text) {
    const raw = String(text || "");
    if (!raw.trim()) return false;
    if (!COMPANY_VERSION_RE.test(raw)) return false;
    return findCompanyDutyStarts(raw).length >= 1;
}

function extractLineCode(text) {
    const match = /^\s*(\d{2,4})\b/.exec(String(text || ""));
    return match ? match[1] : "";
}

function extractValidFrom(text) {
    const match = /Gültig ab\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i.exec(String(text || ""));
    if (!match) return "";
    const day = String(match[1]).padStart(2, "0");
    const month = String(match[2]).padStart(2, "0");
    return `${match[3]}-${month}-${day}`;
}

function extractCourseBlocks(sectionText) {
    const blocks = [];
    const source = String(sectionText || "");
    COURSE_BLOCK_RE.lastIndex = 0;
    let match;
    while ((match = COURSE_BLOCK_RE.exec(source))) {
        const course = match[1];
        const numeric = Number(course);
        // Real Kursnummer on these plans is typically 101–599 (not years / footnote tails).
        if (numeric < 100 || numeric > 799) continue;
        const times = match[2]
            .trim()
            .split(/\s+/)
            .map(normalizeClockToken)
            .filter(Boolean);
        // A full stop list has many times; short clusters are usually noise.
        if (times.length < 8) continue;
        // Verkehrshinweis tails like hi200 / 6k400 can look like Kursnummer 200/400.
        if (numeric % 100 === 0 && times.length < 20) continue;
        blocks.push({
            course,
            start: times[0],
            end: times[times.length - 1],
            stopCount: times.length
        });
    }
    return blocks;
}

function splitDaySections(text) {
    const source = String(text || "");
    const matches = [...source.matchAll(DAY_SECTION_RE)];
    if (!matches.length) {
        return [{ dayType: "SCHOOL_WEEKDAY", body: source }];
    }
    const sections = [];
    for (let i = 0; i < matches.length; i += 1) {
        const current = matches[i];
        const dayType = mapDayType(current[0]);
        if (!dayType) continue;
        const start = current.index + current[0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
        sections.push({ dayType, body: source.slice(start, end) });
    }
    return sections.length ? sections : [{ dayType: "SCHOOL_WEEKDAY", body: source }];
}

function findCompanyDutyStarts(text) {
    const source = String(text || "");
    const starts = [];
    COMPANY_DUTY_RE.lastIndex = 0;
    let match;
    while ((match = COMPANY_DUTY_RE.exec(source))) {
        const code = String(match[1] || "").toUpperCase();
        const before = source.slice(Math.max(0, match.index - 12), match.index);
        if (/(?:an|von)\s+$/i.test(before)) continue;
        const after = source.slice(match.index + match[0].length, match.index + match[0].length + 180);
        if (/^\s*\(ab\s+\d{1,2}:\d{2}\)/i.test(after)) continue;
        const activity = /^(?:\s*\+\s*Bus[\s\S]{0,120}?)?(?:\s*Dienstunterbrechung)?\s+(\d{1,3})\s+(Arbeit|Depot|Trans|Ruhe|P|\d{2,4})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})/i.exec(after);
        if (!activity) continue;
        starts.push({
            index: match.index,
            endHeader: match.index + match[0].length,
            code
        });
    }

    const seen = new Set();
    const unique = [];
    for (const start of starts) {
        if (seen.has(start.code)) continue;
        seen.add(start.code);
        unique.push(start);
    }
    return unique;
}

function parseCompanyDutyActivities(blockText, dutyCode) {
    const source = String(blockText || "");
    const acts = [];
    const seqSeen = new Set();
    COMPANY_ACTIVITY_RE.lastIndex = 0;
    let match;
    while ((match = COMPANY_ACTIVITY_RE.exec(source))) {
        const sequence = String(Number(match[1]));
        if (seqSeen.has(sequence)) continue;
        const start = normalizeColonClock(match[3]);
        const end = normalizeColonClock(match[4]);
        if (!start || !end) continue;
        seqSeen.add(sequence);
        const typeToken = match[2];
        const type = mapCompanyActivityType(typeToken);
        const tail = source.slice(match.index + match[0].length, match.index + match[0].length + 220);
        const courseMatch = /Kurs:\s*(\S+)/i.exec(tail);
        acts.push({
            duty_code: dutyCode,
            sequence,
            activity_type: type,
            start,
            end,
            line: type === "FAHRT" ? clean(typeToken) : "",
            course: type === "FAHRT" && courseMatch ? clean(courseMatch[1]) : "",
            from: "",
            to: ""
        });
    }
    return acts.sort((a, b) => Number(a.sequence) - Number(b.sequence));
}

function parseCompanyDienstplanText(text) {
    const raw = String(text || "").replace(/\u00a0/g, " ");
    if (!looksLikeCompanyDienstplan(raw)) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "unsupported_pdf",
                message: UNSUPPORTED_PDF_MESSAGE
            }],
            plan: null,
            summary: null
        };
    }

    const versionMatch = COMPANY_VERSION_RE.exec(raw);
    if (!versionMatch) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "dienstplan_metadata",
                message: "ca_plan_err_dienstplan_metadata"
            }],
            plan: null,
            summary: null
        };
    }

    const planVersion = compactDigitSpaces(versionMatch[1]);
    const validDay = compactDigitSpaces(versionMatch[2]);
    const validMonth = compactDigitSpaces(versionMatch[3]);
    const validYear = compactDigitSpaces(versionMatch[4]);
    if (!/^\d+$/.test(planVersion) || !/^\d{1,2}$/.test(validDay) || !/^\d{1,2}$/.test(validMonth) || !/^\d{4}$/.test(validYear)) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "dienstplan_metadata",
                message: "ca_plan_err_dienstplan_metadata"
            }],
            plan: null,
            summary: null
        };
    }
    const validFrom = `${validYear}-${validMonth.padStart(2, "0")}-${validDay.padStart(2, "0")}`;
    const dutyStarts = findCompanyDutyStarts(raw);
    if (!dutyStarts.length) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "dienstplan_no_duties",
                message: "ca_plan_err_dienstplan_no_duties"
            }],
            plan: null,
            summary: null
        };
    }

    const planCode = dutyStarts[0].code.split(".")[0] || "";
    const dutyRows = [];
    const activityRows = [];

    for (let i = 0; i < dutyStarts.length; i += 1) {
        const current = dutyStarts[i];
        const dayType = mapCompanyDutyDayType(current.code);
        if (!dayType) {
            return {
                valid: false,
                errors: [{
                    path: "PDF",
                    code: "dienstplan_day_type",
                    message: "ca_plan_err_dienstplan_day_type",
                    params: { duty: current.code }
                }],
                plan: null,
                summary: null
            };
        }

        const blockEnd = i + 1 < dutyStarts.length ? dutyStarts[i + 1].index : raw.length;
        const block = raw.slice(current.endHeader, blockEnd);
        const acts = parseCompanyDutyActivities(block, current.code);
        if (!acts.length) {
            return {
                valid: false,
                errors: [{
                    path: "PDF",
                    code: "dienstplan_no_activities",
                    message: "ca_plan_err_dienstplan_no_activities",
                    params: { duty: current.code }
                }],
                plan: null,
                summary: null
            };
        }

        const trips = acts.filter(activity => activity.activity_type === "FAHRT");
        dutyRows.push({
            duty_code: current.code,
            day_type: dayType,
            work_start: acts[0].start,
            first_trip_start: trips[0]?.start || acts[0].start,
            last_trip_end: trips[trips.length - 1]?.end || acts[acts.length - 1].end,
            work_end: acts[acts.length - 1].end,
            start_location: "",
            end_location: ""
        });
        activityRows.push(...acts);
    }

    return validateBuiltPlan({
        metadata: {
            templateVersion: TEMPLATE_VERSION,
            planCode,
            planVersion,
            validFrom,
            timezone: "Europe/Vienna"
        },
        dutyRows,
        activityRows
    });
}

function parseAustrianFahrplanText(text) {
    const raw = String(text || "").replace(/\u00a0/g, " ");
    if (!looksLikePublicFahrplan(raw)) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "unsupported_pdf",
                message: UNSUPPORTED_PDF_MESSAGE
            }],
            plan: null,
            summary: null
        };
    }

    const lineCode = extractLineCode(raw);
    const validFrom = extractValidFrom(raw);
    if (!lineCode || !validFrom) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "fahrplan_metadata",
                message: "ca_plan_err_fahrplan_metadata"
            }],
            plan: null,
            summary: null
        };
    }

    const dutyRows = [];
    const activityRows = [];
    const seenCodes = new Set();

    for (const section of splitDaySections(raw)) {
        for (const block of extractCourseBlocks(section.body)) {
            const dutyCode = `${lineCode}.${block.course}`;
            // Duty codes must be unique in the catalog; keep first occurrence.
            if (seenCodes.has(dutyCode)) continue;
            seenCodes.add(dutyCode);

            dutyRows.push({
                duty_code: dutyCode,
                day_type: section.dayType,
                work_start: block.start,
                first_trip_start: block.start,
                last_trip_end: block.end,
                work_end: block.end,
                start_location: "",
                end_location: ""
            });
            activityRows.push({
                duty_code: dutyCode,
                sequence: "1",
                activity_type: "FAHRT",
                start: block.start,
                end: block.end,
                line: lineCode,
                course: block.course,
                from: "",
                to: ""
            });
        }
    }

    if (!dutyRows.length) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "fahrplan_no_courses",
                message: "ca_plan_err_fahrplan_no_courses"
            }],
            plan: null,
            summary: null
        };
    }

    return validateBuiltPlan({
        metadata: {
            templateVersion: TEMPLATE_VERSION,
            planCode: lineCode,
            planVersion: validFrom.replace(/-/g, ""),
            validFrom,
            timezone: "Europe/Vienna"
        },
        dutyRows,
        activityRows
    });
}

function parseStructuredPdfText(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw.includes(START_MARKER) || !raw.includes(END_MARKER)) {
        if (looksLikeCompanyDienstplan(text)) {
            return parseCompanyDienstplanText(text);
        }
        if (looksLikePublicFahrplan(text)) {
            return parseAustrianFahrplanText(text);
        }
        const empty = !clean(String(text || "")).replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "").trim();
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: empty ? "pdf_no_text" : "unsupported_pdf",
                message: empty
                    ? "ca_plan_err_pdf_no_text"
                    : UNSUPPORTED_PDF_MESSAGE
            }],
            plan: null,
            summary: null
        };
    }

    const start = raw.indexOf(START_MARKER) + START_MARKER.length;
    const end = raw.indexOf(END_MARKER);
    const body = raw.slice(start, end).trim();
    const tokens = body.split(/\s+/).filter(Boolean);

    const metadata = {};
    const dutyRows = [];
    const activityRows = [];
    const errors = [];

    for (const token of tokens) {
        if (token.startsWith("META:")) {
            const payload = token.slice(5);
            const eq = payload.indexOf("=");
            if (eq <= 0) {
                errors.push({ path: "PDF.META", code: "meta_invalid", message: "ca_plan_err_meta_invalid" });
                continue;
            }
            metadata[clean(payload.slice(0, eq)).toLowerCase()] = clean(decodePdfField(payload.slice(eq + 1)));
            continue;
        }
        if (token.startsWith("DUTY:")) {
            const parts = token.slice(5).split("|");
            if (parts.length < 8) {
                errors.push({ path: "PDF.DUTY", code: "duty_columns", message: "ca_plan_err_duty_columns" });
                continue;
            }
            dutyRows.push({
                duty_code: decodePdfField(parts[0]),
                day_type: decodePdfField(parts[1]),
                work_start: decodePdfField(parts[2]),
                first_trip_start: decodePdfField(parts[3]),
                last_trip_end: decodePdfField(parts[4]),
                work_end: decodePdfField(parts[5]),
                start_location: decodePdfField(parts[6]),
                end_location: decodePdfField(parts[7])
            });
            continue;
        }
        if (token.startsWith("ACT:")) {
            const parts = token.slice(4).split("|");
            if (parts.length < 9) {
                errors.push({ path: "PDF.ACT", code: "act_columns", message: "ca_plan_err_act_columns" });
                continue;
            }
            activityRows.push({
                duty_code: decodePdfField(parts[0]),
                sequence: decodePdfField(parts[1]),
                activity_type: decodePdfField(parts[2]),
                start: decodePdfField(parts[3]),
                end: decodePdfField(parts[4]),
                line: decodePdfField(parts[5]),
                course: decodePdfField(parts[6]),
                from: decodePdfField(parts[7]),
                to: decodePdfField(parts[8])
            });
            continue;
        }
        errors.push({
            path: "PDF",
            code: "unknown_token",
            message: "ca_plan_err_unknown_token",
            params: { token: token.slice(0, 40) }
        });
    }

    for (const key of ["template_version", "plan_code", "plan_version", "valid_from", "timezone"]) {
        if (!clean(metadata[key])) {
            errors.push({
                path: `PLAN.${key}`,
                code: "missing_value",
                message: "ca_plan_err_missing_value",
                params: { field: key }
            });
        }
    }
    if (errors.length) return { valid: false, errors, plan: null, summary: null };

    return validateBuiltPlan({
        metadata: {
            templateVersion: metadata.template_version,
            planCode: metadata.plan_code,
            planVersion: metadata.plan_version,
            validFrom: metadata.valid_from,
            timezone: metadata.timezone
        },
        dutyRows,
        activityRows
    });
}

function buildStructuredPdfPayload(planInput) {
    const meta = [
        `META:template_version=${encodePdfField(planInput.templateVersion || TEMPLATE_VERSION)}`,
        `META:plan_code=${encodePdfField(planInput.planCode)}`,
        `META:plan_version=${encodePdfField(planInput.planVersion)}`,
        `META:valid_from=${encodePdfField(planInput.validFrom)}`,
        `META:timezone=${encodePdfField(planInput.timezone)}`
    ];
    const duties = (planInput.duties || []).map(duty =>
        `DUTY:${[
            duty.code, duty.dayType, duty.workStart, duty.firstTripStart,
            duty.lastTripEnd, duty.workEnd, duty.startLocation, duty.endLocation
        ].map(encodePdfField).join("|")}`
    );
    const activities = (planInput.activities || []).map(activity =>
        `ACT:${[
            activity.dutyCode, activity.sequence, activity.type, activity.start, activity.end,
            activity.line, activity.course, activity.from, activity.to
        ].map(encodePdfField).join("|")}`
    );
    return [START_MARKER, ...meta, ...duties, ...activities, END_MARKER].join(" ");
}

async function extractPdfText(arrayBuffer) {
    const { ensurePdfJs } = await import("../core/office-parsers.js");
    const pdfjsLib = await ensurePdfJs();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += `${joinPdfTextItems(content.items)}\n`;
    }
    return text;
}

async function parseServicePlanPdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const text = await extractPdfText(arrayBuffer);
    return parseStructuredPdfText(text);
}

export {
    END_MARKER,
    MARKER,
    START_MARKER,
    buildStructuredPdfPayload,
    joinPdfTextItems,
    looksLikeCompanyDienstplan,
    looksLikePublicFahrplan,
    parseAustrianFahrplanText,
    parseCompanyDienstplanText,
    parseServicePlanPdfFile,
    parseStructuredPdfText
};
