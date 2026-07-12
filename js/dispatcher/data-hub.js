// BusCommand — uvoz podataka u Group Hub-u
import { getBereitschaftCode } from "../core/line-shift-catalog.js";
import { renderBusesList } from "../data/buses-routes.js";
import { renderDriversList } from "../data/drivers.js";
import { renderBlagussImportPreview } from "../imports/blaguss-package-import.js";
import { getHubGroupId } from "./group-hub.js";
import { renderPlanImportPreview } from "./plan-import.js";
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
                <strong style="color:#f59e0b;">${t("catalog_not_loaded")}</strong> — ${t("catalog_not_loaded_desc", { code: brCode || "linija.X2" })}
            </div>`;
        return;
    }

    const x2 = brCode ? entries[brCode] : null;
    el.innerHTML = `
        <div style="padding:12px 14px;border-radius:var(--radius-md);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);font-size:0.88rem;display:flex;flex-wrap:wrap;gap:12px 20px;">
            <span><strong style="color:#10b981;">${count}</strong> ${t("catalog_shifts")}</span>
            <span>${version}${verLabel}</span>
            <span>${t("catalog_group")}: <strong>${groupName}</strong></span>
            ${x2 ? `<span>x2 Bereitschaft: <strong>${x2.shortName || brCode}</strong></span>` : ""}
        </div>`;
}

function renderDispatcherDataHub() {
    renderShiftCatalogStatus();
    renderDriversList();
    renderBusesList();
    renderPlanImportPreview();
    renderBlagussImportPreview();
}

export {
    renderDispatcherDataHub,
    renderShiftCatalogStatus
};
