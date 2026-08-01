// ============================================================
// BusCommand — Runtime konfiguracija (demo vs produkcija)
// ============================================================

const BusCommandConfig = (() => {
    const params = new URLSearchParams(window.location.search);
    const host     = window.location.hostname;
    const isLocal  = host === "localhost" || host === "127.0.0.1" ||
                     /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

    const quickDemo = isLocal ? params.get("demo") : null; // lokalni QA prečac; nikada na javnom hostu
    const modeParam = params.get("mode"); // "demo" | "production"

    const IS_DEMO_MODE = (() => {
        if (quickDemo === "driver" || quickDemo === "dispatcher") return true;
        if (isLocal && modeParam === "demo") return true;
        if (modeParam === "production") return false;
        if (isLocal) return true;
        return false;
    })();

    const COMPANY_ID = (() => {
        const companyParam = params.get("company");
        if (companyParam) return companyParam.toLowerCase();
        if (IS_DEMO_MODE) return "local-qa";
        const sub = host.split(".")[0];
        return (sub && sub !== "www" && sub !== "localhost") ? sub.toLowerCase() : "";
    })();

    return {
        IS_DEMO_MODE,
        COMPANY_ID,
        IS_LOCAL: isLocal,
        IS_QUICK_DEMO: quickDemo === "driver" || quickDemo === "dispatcher",
        QUICK_DEMO_ROLE: quickDemo === "driver" || quickDemo === "dispatcher" ? quickDemo : null,
        VERSION: "1.0.1"
    };
})();

const IS_DEMO_MODE = BusCommandConfig.IS_DEMO_MODE;
const COMPANY_ID   = BusCommandConfig.COMPANY_ID;

// ESM moduli čitaju preko window.*
window.BusCommandConfig = BusCommandConfig;
window.IS_DEMO_MODE = IS_DEMO_MODE;
window.COMPANY_ID = COMPANY_ID;
