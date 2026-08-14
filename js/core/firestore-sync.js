// BusCommand — pomoćne funkcije za Firestore diff + batch (testabilno)

export const FIRESTORE_BATCH_LIMIT = 500;

export function docIdFromRecord(obj) {
    if (!obj) return "";
    return String(obj.id || obj.number || "");
}

export function idsFromList(list) {
    return new Set((list || []).map(docIdFromRecord).filter(Boolean));
}

/**
 * @param {Array} localList
 * @param {Set<string>|null} baselineIds — null = ne briši (baseline još nije poznat)
 */
export function diffCollectionOps(localList, baselineIds) {
    const localIds = new Set();
    const sets = [];
    const audit = { added: [], updated: [], removed: [] };

    for (const docObj of localList || []) {
        const id = docIdFromRecord(docObj);
        if (!id) continue;
        localIds.add(id);
        sets.push({ id, data: docObj });
        if (baselineIds) {
            if (!baselineIds.has(id)) audit.added.push(id);
            else audit.updated.push(id);
        } else {
            audit.added.push(id);
        }
    }

    if (baselineIds) {
        for (const id of baselineIds) {
            if (!localIds.has(id)) audit.removed.push(id);
        }
    }

    return { sets, deletes: audit.removed, localIds, audit };
}

export function chunkArray(arr, size = FIRESTORE_BATCH_LIMIT) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

export function summarizeAuditChanges(changesByKey) {
    const summary = {};
    for (const [key, audit] of Object.entries(changesByKey)) {
        if (!audit.added.length && !audit.updated.length && !audit.removed.length) continue;
        summary[key] = {
            added: audit.added.length,
            updated: audit.updated.length,
            removed: audit.removed.length
        };
        if (audit.added.length <= 8) summary[key].addedIds = audit.added;
        if (audit.removed.length <= 8) summary[key].removedIds = audit.removed;
    }
    return summary;
}

export function hasAuditActivity(summary, extras = {}) {
    if (Object.keys(summary).length > 0) return true;
    return Object.values(extras).some(Boolean);
}
