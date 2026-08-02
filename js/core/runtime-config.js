// BusCommand ESM — demo vs produkcija (zamjena za config.js)
import { resolveRuntimeMode } from "./runtime-mode.js";

export const BusCommandConfig = (() => {
    const host = window.location.hostname;
    const mode = resolveRuntimeMode({ hostname: host, search: window.location.search });
    const IS_DEMO_MODE = mode.isDemoMode;

    const COMPANY_ID = (() => {
        const companyParam = new URLSearchParams(window.location.search).get("company");
        if (IS_DEMO_MODE) return "demo";
        const normalized = companyParam?.trim().toLowerCase() || null;
        return normalized === "buscommand-preview" ? null : normalized;
    })();

    return {
        IS_DEMO_MODE,
        COMPANY_ID,
        IS_LOCAL: mode.isLocal,
        IS_QUICK_DEMO: mode.quickDemoRole !== null,
        QUICK_DEMO_ROLE: mode.quickDemoRole,
        VERSION: "1.0.10"
    };
})();

export const IS_DEMO_MODE = BusCommandConfig.IS_DEMO_MODE;
export const COMPANY_ID = BusCommandConfig.COMPANY_ID;
