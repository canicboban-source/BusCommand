import { TEMPLATE_VERSION } from "../../shared/service-plan-contract.mjs";
import { clean, validateBuiltPlan } from "./service-plan-shared.js";

const MARKER = TEMPLATE_VERSION;
const START_MARKER = `BUSCOMMAND-DIENSTPLAN-START ${MARKER}`;
const END_MARKER = `BUSCOMMAND-DIENSTPLAN-END ${MARKER}`;

const DAY_SECTION_RE = /(Montag\s*[-–]\s*Freitag|Samstag(?:\s*\(Werktag\))?|Sonn-?\s*und\s*Feiertag|Sonntag(?:\s*und\s*Feiertag)?|\bSa\b(?!\w))/gi;
const TIME_TOKEN_RE = /\b(\d{1,2})\.(\d{2})\b/g;
// Kursnummer must be a standalone 3-digit token (not the MM of 6.22, not the tail of hi200).
const COURSE_BLOCK_RE = /(?<![A-Za-z0-9.])(\d{3})\s+((?:\d{1,2}\.\d{2}(?:\s+|\s*$))+)/g;

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

function mapDayType(label) {
    const text = clean(label).toLowerCase();
    if (text.includes("samstag") || text === "sa") return "SATURDAY";
    if (text.includes("sonn") || text.includes("feiertag")) return "SUNDAY_HOLIDAY";
    if (text.includes("montag") || text.includes("freitag")) return "SCHOOL_WEEKDAY";
    return null;
}

function looksLikePublicFahrplan(text) {
    const raw = String(text || "");
    if (!raw.trim()) return false;
    if (/Kursnummer/i.test(raw) && /Gültig ab/i.test(raw)) return true;
    if (/Betreiber:/i.test(raw) && /Gültig ab/i.test(raw) && TIME_TOKEN_RE.test(raw)) return true;
    return false;
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

function parseAustrianFahrplanText(text) {
    const raw = String(text || "").replace(/\u00a0/g, " ");
    if (!looksLikePublicFahrplan(raw)) {
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "unsupported_pdf",
                message: "Dozvoljen je samo strukturirani BusCommand PDF šablon (BUSCOMMAND-DIENSTPLAN-1) ili javni austrijski Fahrplan PDF (linija + Gültig ab + Kursnummer)."
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
                message: "Fahrplan PDF mora imati broj linije na početku i datum „Gültig ab DD.MM.YYYY“."
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
                message: "U Fahrplan PDF-u nisu pronađeni kursevi sa vremenima (npr. 101 5.11 …)."
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
        if (looksLikePublicFahrplan(text)) {
            return parseAustrianFahrplanText(text);
        }
        return {
            valid: false,
            errors: [{
                path: "PDF",
                code: "unsupported_pdf",
                message: "Ovaj PDF nije BusCommand Dienstplan šablon. Preuzmite XLSX/CSV/PDF šablon sa stranice, ili ubacite javni austrijski Fahrplan (linija + Gültig ab + Kursnummer)."
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
                errors.push({ path: "PDF.META", code: "missing_value", message: "META red nije ispravan." });
                continue;
            }
            metadata[clean(payload.slice(0, eq)).toLowerCase()] = clean(decodePdfField(payload.slice(eq + 1)));
            continue;
        }
        if (token.startsWith("DUTY:")) {
            const parts = token.slice(5).split("|");
            if (parts.length < 8) {
                errors.push({ path: "PDF.DUTY", code: "missing_column", message: "DUTY red nema sve kolone." });
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
                errors.push({ path: "PDF.ACT", code: "missing_column", message: "ACT red nema sve kolone." });
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
        errors.push({ path: "PDF", code: "unknown_token", message: `Nepoznat PDF token: ${token.slice(0, 40)}` });
    }

    for (const key of ["template_version", "plan_code", "plan_version", "valid_from", "timezone"]) {
        if (!clean(metadata[key])) {
            errors.push({ path: `PLAN.${key}`, code: "missing_value", message: `Nedostaje vrednost ${key}.` });
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
    if (typeof pdfjsLib === "undefined") throw new Error("PDF.js parser nije učitan.");
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i += 1) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ") + "\n";
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
    looksLikePublicFahrplan,
    parseAustrianFahrplanText,
    parseServicePlanPdfFile,
    parseStructuredPdfText
};
