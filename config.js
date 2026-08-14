// ============================================================
// BusCommand — legacy global runtime config (must match ESM runtime-config)
// Demo URL activation is forbidden. Local state only via QA harness flag.
// ============================================================

const BusCommandConfig = (() => {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const useLocalState = typeof window !== "undefined"
        && window.__BUSCOMMAND_QA_HARNESS__ === true;

    const COMPANY_ID = (() => {
        const companyParam = new URLSearchParams(window.location.search).get("company");
        if (useLocalState) {
            const qaCompany = window.__BUSCOMMAND_QA_COMPANY_ID__;
            return (typeof qaCompany === "string" && qaCompany.trim())
                ? qaCompany.trim().toLowerCase()
                : "qa-local";
        }
        const normalized = companyParam?.trim().toLowerCase() || null;
        return normalized === "buscommand-preview" ? null : normalized;
    })();

    return {
        USE_LOCAL_STATE: useLocalState,
        COMPANY_ID,
        IS_LOCAL: isLocal,
        IS_QUICK_DEMO: false,
        QUICK_DEMO_ROLE: null,
        VERSION: "1.0.10"
    };
})();

const USE_LOCAL_STATE = BusCommandConfig.USE_LOCAL_STATE;
const COMPANY_ID = BusCommandConfig.COMPANY_ID;
