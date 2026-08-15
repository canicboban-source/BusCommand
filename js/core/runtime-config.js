// BusCommand ESM — production vs isolated QA local-state (never URL demo)
import { resolveRuntimeMode } from "./runtime-mode.js";

export const BusCommandConfig = (() => {
    const host = window.location.hostname;
    const mode = resolveRuntimeMode({ hostname: host, search: window.location.search });
    const USE_LOCAL_STATE = mode.useLocalState === true;

    const COMPANY_ID = (() => {
        const companyParam = new URLSearchParams(window.location.search).get("company");
        if (USE_LOCAL_STATE) {
            const qaCompany = typeof window !== "undefined" && window.__BUSCOMMAND_QA_COMPANY_ID__;
            return (typeof qaCompany === "string" && qaCompany.trim())
                ? qaCompany.trim().toLowerCase()
                : "qa-local";
        }
        const normalized = companyParam?.trim().toLowerCase() || null;
        return normalized === "buscommand-preview" ? null : normalized;
    })();

    return {
        USE_LOCAL_STATE,
        COMPANY_ID,
        IS_LOCAL: mode.isLocal,
        IS_QUICK_DEMO: false,
        QUICK_DEMO_ROLE: null,
        VERSION: "1.0.10"
    };
})();

export const USE_LOCAL_STATE = BusCommandConfig.USE_LOCAL_STATE;
export const COMPANY_ID = BusCommandConfig.COMPANY_ID;
