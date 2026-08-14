// BusCommand — lagani state observer (plan stavka 11)
// Osvežava vidljive dispečerske ekrane posle saveState / cross-tab sync.

/** @type {Map<string, () => void>} */
const sectionRenderers = new Map();

/** @type {Set<string>} */
const OBSERVED_SECTIONS = new Set([
    "dispatcher-dashboard",
    "dispatcher-shifts",
    "dispatcher-group-hub"
]);

/** @type {Record<string, string[]>} */
const TOPIC_SECTIONS = {
    shifts: ["dispatcher-shifts"],
    drivers: ["dispatcher-dashboard", "dispatcher-shifts", "dispatcher-group-hub"],
    groups: ["dispatcher-dashboard", "dispatcher-shifts", "dispatcher-group-hub"],
    messages: ["dispatcher-dashboard"],
    reports: ["dispatcher-dashboard"],
    plans: ["dispatcher-group-hub"],
    hub: ["dispatcher-group-hub"],
    sos: ["dispatcher-dashboard"],
    all: [...OBSERVED_SECTIONS]
};

let refreshScheduled = false;

export function registerSectionRenderer(sectionId, renderFn) {
    if (typeof renderFn === "function") {
        sectionRenderers.set(sectionId, renderFn);
    }
}

export function getActiveSectionId() {
    const active = document.querySelector(".content-section:not(.hidden)");
    return active?.id || null;
}

function isSectionVisible(sectionId) {
    const el = document.getElementById(sectionId);
    return Boolean(el && !el.classList.contains("hidden"));
}

function resolveSections(topics) {
    const ids = new Set();
    const list = topics?.length ? topics : ["all"];
    for (const topic of list) {
        const mapped = TOPIC_SECTIONS[topic] || (OBSERVED_SECTIONS.has(topic) ? [topic] : []);
        mapped.forEach((id) => ids.add(id));
    }
    return [...ids];
}

function runRefresh(topics) {
    if (!window.currentUser || window.currentUser.role !== "dispatcher") return;

    for (const sectionId of resolveSections(topics)) {
        if (!OBSERVED_SECTIONS.has(sectionId)) continue;
        if (!isSectionVisible(sectionId)) continue;
        const render = sectionRenderers.get(sectionId);
        if (typeof render === "function") {
            try {
                render();
            } catch (err) {
                console.warn("[state-observer] render failed:", sectionId, err);
            }
        }
    }
}

/**
 * Osveži posmatrane sekcije koje su trenutno vidljive.
 * @param {{ topics?: string[] }} [options]
 */
export function refreshObservedSections(options = {}) {
    runRefresh(options.topics);
}

/**
 * Jedan refresh po animation frame — sprečava dupli render pri save + ručnom pozivu.
 */
export function scheduleRefreshObservedSections(options = {}) {
    if (refreshScheduled) return;
    refreshScheduled = true;
    requestAnimationFrame(() => {
        refreshScheduled = false;
        runRefresh(options.topics);
    });
}

export function installStateObserver() {
    // Registracija renderera — poziva se iz bootstrap/init posle učitavanja modula
}
