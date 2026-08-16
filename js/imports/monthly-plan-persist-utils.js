function normalizeType(shift) {
    const allowed = new Set([
        "morning", "afternoon", "night", "bereitschaft", "off", "vacation", "sick"
    ]);
    const type = String(shift?.type || "morning").toLowerCase();
    return allowed.has(type) ? type : "morning";
}

/** Inlined on purpose: this module must stay import-free so bare node --test
 *  contexts can load it without the browser runtime-config chain. Keep the
 *  folding rules in sync with foldDiacritics() in import-parse-utils.js. */
function foldName(name) {
    return String(name || "")
        .replace(/đ/g, "dj").replace(/Đ/g, "Dj")
        .replace(/č|ć/g, "c").replace(/Č|Ć/g, "C")
        .replace(/š/g, "s").replace(/Š/g, "S")
        .replace(/ž/g, "z").replace(/Ž/g, "Z")
        .trim().toLowerCase().replace(/\s+/g, " ");
}

/** Exact-name lookup with diacritics folding, so persist phase never drops a
 *  driver that the import preview already matched (e.g. "Djordjevic" → "Đorđević"). */
function findDriverByName(drivers, driverName) {
    const needle = foldName(driverName);
    if (!needle) return null;
    return (drivers || []).find((driver) => foldName(driver.name) === needle) || null;
}

export { normalizeType, findDriverByName };
