// BusCommand — ekstrakcija teksta iz planova (Excel, PDF, CSV, TXT)

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

async function extractTextFromScheduleFile(file) {
    const name = file.name.toLowerCase();
    const fileData = await readFileAsDataURL(file);
    let extractedText = "";

    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        extractedText = rows
            .filter(row => row && row.length > 0)
            .map(row => row.join(" | "))
            .join("\n");
    } else if (name.endsWith(".csv")) {
        extractedText = await readFileAsText(file);
    } else if (name.endsWith(".pdf") || file.type === "application/pdf") {
        const arrayBuffer = await readFileAsArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            extractedText += textContent.items.map(item => item.str).join(" ") + "\n";
        }
    } else {
        extractedText = await readFileAsText(file);
    }

    return { text: extractedText, fileData };
}

function parseExtractedScheduleText(text) {
    const lines = (text || "").split(/[\r\n]+/);
    const parsedShifts = {};

    lines.forEach(line => {
        const dateMatch = line.match(/^\s*([0-3]?\d)[./\s-]/) || line.match(/\b([0-3]?\d)\.(?:0?[1-9]|1[0-2])\b/);
        if (!dateMatch) return;

        const day = parseInt(dateMatch[1], 10);
        if (day < 1 || day > 31) return;

        const lowerLine = line.toLowerCase();
        let shiftType = "";
        let shiftName = "";

        const codeMatch = line.match(/\b(\d{3}\.[S\d]?\d{2,3})\b/) || line.match(/\b(\d{3}\.\d{3})\b/);
        const busMatch = line.match(/Bus\s*(\d+)/i) || line.match(/\b(91\d{3})\b/);
        const busStr = busMatch ? `(Bus ${busMatch[1]})` : "";

        if (codeMatch) {
            shiftName = `${codeMatch[1]} ${busStr}`.trim();
            if (/früh|morning|prva|s0[1-6]\b/i.test(lowerLine)) shiftType = "morning";
            else shiftType = "afternoon";
        } else if (/frei|off|slobodan|abwesenheit/i.test(lowerLine)) {
            shiftType = "off";
            shiftName = "Frei";
        } else if (/urlaub|vacation|odmor/i.test(lowerLine)) {
            shiftType = "vacation";
            shiftName = "Urlaub";
        } else if (/krank|sick|bolovanje/i.test(lowerLine)) {
            shiftType = "sick";
            shiftName = "Krank";
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
                routeCode: codeMatch ? codeMatch[1] : null
            };
        }
    });

    const dayCount = Object.keys(parsedShifts).length;
    return {
        shifts: parsedShifts,
        dayCount,
        quality: dayCount >= 5 ? "ok" : (dayCount > 0 ? "partial" : "empty")
    };
}

export {
    extractTextFromScheduleFile,
    parseExtractedScheduleText
};
