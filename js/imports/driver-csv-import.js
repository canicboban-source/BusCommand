// BusCommand — Driver CSV uvoz vozača (header-aware, separator ;)

function detectSeparator(headerLine) {
    if (headerLine.includes(";")) return ";";
    if (headerLine.includes("\t")) return "\t";
    return ",";
}

function parseDriverCsv(text) {
    const lines = (text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return { drivers: [], errors: ["Prazan fajl"] };

    const sep = detectSeparator(lines[0]);
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());

    const col = (needles) => headers.findIndex(h => needles.some(n => h.includes(n)));

    const idx = {
        name: col(["ime_prezime", "ime", "name", "vozač", "vozac"]),
        email: col(["email", "e-mail"]),
        companyId: col(["firma_id", "firm_id", "company"]),
        pin: col(["licni_kod", "pin", "kod_za_app", "kod"]),
        phone: col(["telefon", "phone"]),
        group: col(["grupa", "group"])
    };

    if (idx.name < 0 || idx.pin < 0) {
        return { drivers: [], errors: ["CSV mora imati kolone za ime i PIN (licni_kod_za_app)."] };
    }

    const drivers = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim());
        const name = cols[idx.name] || "";
        const pin = cols[idx.pin] || "";
        if (!name || !pin) continue;

        drivers.push({
            name,
            pin,
            email: idx.email >= 0 ? cols[idx.email] : "",
            companyId: idx.companyId >= 0 ? cols[idx.companyId] : "",
            phone: idx.phone >= 0 ? cols[idx.phone] : "",
            groupName: idx.group >= 0 ? cols[idx.group] : ""
        });
    }

    if (!drivers.length) errors.push("Nijedan vozač nije parsiran.");

    return { drivers, errors, format: "driver-csv" };
}

export {
    parseDriverCsv
};
