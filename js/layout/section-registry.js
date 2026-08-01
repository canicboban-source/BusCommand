// BusCommand — section switch handlers registered per surface
const sectionHandlers = new Map();

export function registerSectionHandler(sectionId, handler) {
    if (!sectionId || typeof handler !== "function") return;
    sectionHandlers.set(sectionId, handler);
}

export function registerSectionHandlers(map) {
    if (!map || typeof map !== "object") return;
    for (const [sectionId, handler] of Object.entries(map)) {
        registerSectionHandler(sectionId, handler);
    }
}

export function runSectionHandler(sectionId) {
    const handler = sectionHandlers.get(sectionId);
    if (typeof handler === "function") handler(sectionId);
}

export function clearSectionHandlers() {
    sectionHandlers.clear();
}

export function listRegisteredSections() {
    return [...sectionHandlers.keys()];
}
