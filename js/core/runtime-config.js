// BusCommand ESM — demo vs produkcija (zamjena za config.js)

export const BusCommandConfig = (() => {
    const params = new URLSearchParams(window.location.search);
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" ||
        /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

    const quickDemo = params.get("demo");
    const modeParam = params.get("mode");

    const IS_DEMO_MODE = (() => {
        if (quickDemo === "driver" || quickDemo === "dispatcher") return true;
        if (modeParam === "demo") return true;
        if (modeParam === "production") return false;
        if (isLocal) return true;
        return false;
    })();

    const COMPANY_ID = (() => {
        const companyParam = params.get("company");
        if (companyParam) return companyParam.toLowerCase();
        if (IS_DEMO_MODE) return "demo";
        const sub = host.split(".")[0];
        return (sub && sub !== "www" && sub !== "localhost") ? sub.toLowerCase() : "demo";
    })();

    return {
        IS_DEMO_MODE,
        COMPANY_ID,
        IS_LOCAL: isLocal,
        IS_QUICK_DEMO: quickDemo === "driver" || quickDemo === "dispatcher",
        QUICK_DEMO_ROLE: quickDemo === "driver" || quickDemo === "dispatcher" ? quickDemo : null,
        VERSION: "30.1.0",
        DEMO_SA_PIN: "admin123"
    };
})();

export const IS_DEMO_MODE = BusCommandConfig.IS_DEMO_MODE;
export const COMPANY_ID = BusCommandConfig.COMPANY_ID;
