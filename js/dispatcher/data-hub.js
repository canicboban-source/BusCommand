// BusCommand — uvoz podataka u Group Hub-u
import { getBereitschaftCode } from "../core/line-shift-catalog.js";
import { escapeHtml } from "../core/utils.js";
import { renderBusesList } from "../data/buses-routes.js";
import { renderDriversList } from "../data/drivers.js";
import { renderPackageImportPreview } from "../imports/package-import.js";
import { getHubGroupId } from "./group-hub.js";
import { t } from "../ui/i18n.js";

function renderShiftCatalogStatus() {
    const el = document.getElementById("shift-catalog-status");
    if (!el) return;

    const cat = window.state.shiftCatalog;
    const entries = cat?.entries || {};
    const count = Object.keys(entries).length;
    const version = cat?.lineId ? t("catalog_line", { id: cat.lineId }) : "";
    const verLabel = cat?.version ? ` · ${cat.version}` : "";
    const hubId = getHubGroupId();
    const groupName = window.state.groups?.find(g => g.id === hubId)?.name || "—";
    const brCode = hubId ? getBereitschaftCode(hubId) : "";

    if (count === 0) {
        el.innerHTML = `
            <div style="padding:12px 14px;border-radius:var(--radius-md);background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);font-size:0.88rem;">
                <strong style="color:#f59e0b;">${t("catalog_not_loaded")}</strong> — ${escapeHtml(t("catalog_not_loaded_desc", { code: brCode || "linija.X2" }))}
            </div>`;
        return;
    }

    const x2 = brCode ? entries[brCode] : null;
    el.innerHTML = `
        <div style="padding:12px 14px;border-radius:var(--radius-md);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);font-size:0.88rem;display:flex;flex-wrap:wrap;gap:12px 20px;">
            <span><strong style="color:#10b981;">${count}</strong> ${t("catalog_shifts")}</span>
            <span>${escapeHtml(version)}${escapeHtml(verLabel)}</span>
            <span>${t("catalog_group")}: <strong>${escapeHtml(groupName)}</strong></span>
            ${x2 ? `<span>${t("on_call_label")}: <strong>${escapeHtml(x2.shortName || brCode)}</strong></span>` : ""}
        </div>`;
}

function renderDispatcherDataHub() {
    const isCompanyAdmin = window.currentUser?.role === "company-admin";
    const title = document.querySelector("#group-hub-step-import [data-i18n='import_all_title']");
    const subtitle = document.querySelector("#group-hub-step-import [data-i18n='import_all_subtitle']");
    const dropMain = document.querySelector("#package-import-dropzone [data-i18n='import_drop_main']");
    if (title) title.textContent = t(isCompanyAdmin ? "import_all_title" : "import_plan_only_title");
    if (subtitle) subtitle.textContent = t(isCompanyAdmin ? "import_all_subtitle" : "import_plan_only_subtitle");
    if (dropMain) dropMain.textContent = t(isCompanyAdmin ? "import_drop_main" : "import_plan_only_drop");
    renderShiftCatalogStatus();
    renderDriversList();
    renderBusesList();
    // D23/2R-B: plan-import is a lazy chunk — refresh preview only if already loaded
    // or the monthly import panel is present (do not pull chunk into staff main).
    if (document.getElementById("plan-import-preview")) {
        void import("./plan-import.js").then((m) => m.renderPlanImportPreview()).catch(() => {});
    }
    renderPackageImportPreview();
}

export {
    renderDispatcherDataHub,
    renderShiftCatalogStatus
};
