// BusCommand — ekstrakcija teksta iz planova (Excel, PDF, CSV, TXT, slike)

async function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result);
        r.onerror = reject;
        r.readAsArrayBuffer(file);
    });
}

async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result);
        r.onerror = reject;
        r.readAsText(file);
    });
}

async function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

async function extractTextFromImageFile(file) {
    const { ensureTesseract } = await import("../core/office-parsers.js");
    const Tesseract = await ensureTesseract();
    const result = await Tesseract.recognize(file, "deu+eng", {
        logger: () => {}
    });
    return String(result?.data?.text || "");
}

async function extractTextFromScheduleFile(file) {
    const name = file.name.toLowerCase();
    const fileData = await readFileAsDataURL(file);
    let extractedText = "";

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const { ensureXlsx } = await import("../core/office-parsers.js");
        const XLSX = await ensureXlsx();
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        extractedText = (workbook.SheetNames || []).map((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
            return rows
                .filter((row) => row && row.length > 0)
                .map((row) => row.join(" | "))
                .join("\n");
        }).join("\n");
    } else if (name.endsWith(".csv")) {
        extractedText = await readFileAsText(file);
    } else if (name.endsWith(".pdf") || file.type === "application/pdf") {
        const { ensurePdfJs } = await import("../core/office-parsers.js");
        const pdfjsLib = await ensurePdfJs();
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            extractedText += textContent.items.map((item) => item.str).join(" ") + "\n";
        }
    } else if (/\.(jpe?g|png|webp|gif)$/i.test(name) || /^image\//.test(file.type || "")) {
        try {
            extractedText = await extractTextFromImageFile(file);
        } catch (err) {
            console.warn("OCR failed for schedule image:", file.name, err);
            extractedText = "";
        }
    } else {
        extractedText = await readFileAsText(file);
    }

    return { text: extractedText, fileData };
}

function parseExtractedScheduleText(text) {
    const lines = (text || "").split(/[\r\n]+/);
    const parsedShifts = {};
    let month = null;

    const von = String(text || "").match(/von\s+(\d{2})\.(\d{2})\.(20\d{2})\s+bis/i);
    if (von) month = `${von[3]}-${von[2]}`;

    lines.forEach((line) => {
        const dateMatch = line.match(/\b([0-3]?\d)\.([01]?\d)\.(20\d{2})\b/)
            || line.match(/^\s*([0-3]?\d)[./\s-]/);
        if (!dateMatch) return;

        const day = parseInt(dateMatch[1], 10);
        if (day < 1 || day > 31) return;

        if (dateMatch[2] && dateMatch[3] && !month) {
            month = `${dateMatch[3]}-${String(dateMatch[2]).padStart(2, "0")}`;
        }

        const lowerLine = line.toLowerCase();
        let shiftType = "";
        let shiftName = "";

        // 320.F06 / 320.S09 / 320.701 — F/S/X and numeric service codes
        const codeMatch = line.match(/\b(\d{3}\.[FSX]?\d{2,3})\b/i) || line.match(/\b(\d{3}\.\d{3})\b/);
        const busMatch = line.match(/Bus\s*(\d+)/i) || line.match(/\b(91\d{3})\b/) || line.match(/\|\s*(\d{5})\s*\|/);
        const busStr = busMatch ? `(Bus ${busMatch[1]})` : "";

        if (codeMatch) {
            const code = codeMatch[1].toUpperCase();
            shiftName = `${code} ${busStr}`.trim();
            if (/\.7\d{2}$/.test(code)) shiftType = "afternoon";
            else if (/früh|morning|prva|s0[1-6]\b/i.test(lowerLine)) shiftType = "morning";
            else shiftType = "morning";
        } else if (/\burlaub\b|vacation|odmor/i.test(lowerLine)) {
            shiftType = "vacation";
            shiftName = "Urlaub";
        } else if (/\bfrei\b|\boff\b|slobodan|abwesenheit/i.test(lowerLine)) {
            shiftType = "off";
            shiftName = "Frei";
        } else if (/krank|sick|bolovanje/i.test(lowerLine)) {
            shiftType = "sick";
            shiftName = "Krank";
        } else if (/\bdienst\b/i.test(lowerLine) && !/\d{3}\./.test(line)) {
            shiftType = "morning";
            shiftName = "Dienst";
        } else if (/früh|morning|prva/i.test(lowerLine)) {
            shiftType = "morning";
            shiftName = `Frühschicht ${busStr}`.trim();
        } else if (/spät|afternoon|druga|nachmittag/i.test(lowerLine)) {
            shiftType = "afternoon";
            shiftName = `Spätschicht ${busStr}`.trim();
        } else if (/nacht|night|noć/i.test(lowerLine)) {
            shiftType = "night";
            shiftName = `Nachtdienst ${busStr}`.trim();
        }

        if (shiftType) {
            parsedShifts[day] = {
                type: shiftType,
                name: shiftName,
                bus: busMatch ? busMatch[1] : null,
                routeCode: codeMatch ? codeMatch[1].toUpperCase() : null
            };
        }
    });

    const dayCount = Object.keys(parsedShifts).length;
    return {
        shifts: parsedShifts,
        dayCount,
        month,
        quality: dayCount >= 5 ? "ok" : (dayCount > 0 ? "partial" : "empty")
    };
}

export {
    extractTextFromScheduleFile,
    parseExtractedScheduleText
};
