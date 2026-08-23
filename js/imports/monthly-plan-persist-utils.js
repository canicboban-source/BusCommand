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

function nameTokens(name) {
    const folded = foldName(name);
    if (!folded) return [];
    return folded.split(" ").filter(Boolean);
}

function tokenMultisetEquals(tokensA, tokensB) {
    if (tokensA.length !== tokensB.length || tokensA.length === 0) return false;
    const sortedA = [...tokensA].sort();
    const sortedB = [...tokensB].sort();
    for (let i = 0; i < sortedA.length; i++) {
        if (sortedA[i] !== sortedB[i]) return false;
    }
    return true;
}

/** Exact-name lookup with diacritics folding and token multiset reordering, so
 *  persist phase never drops a driver that the import preview already matched. */
function findDriverByName(drivers, driverName) {
    const needle = foldName(driverName);
    if (!needle) return null;
    const needleTokens = nameTokens(driverName);

    const candidates = (drivers || []).filter((driver) => {
        const dKey = foldName(driver?.name);
        if (dKey === needle) return true;
        if (needleTokens.length >= 2) {
            const dTokens = nameTokens(driver?.name);
            return tokenMultisetEquals(needleTokens, dTokens);
        }
        return false;
    });

    if (candidates.length === 1) return candidates[0];
    return null;
}

export { normalizeType, findDriverByName, tokenMultisetEquals };
