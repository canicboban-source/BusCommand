import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";

let events = [];
let nextCursor = null;
let loading = false;
let filterTimer = null;

function readFilters() {
    const value = id => document.getElementById(id)?.value?.trim() || "";
    const from = value("ca-audit-from");
    const to = value("ca-audit-to");
    return {
        category: value("ca-audit-category"),
        action: value("ca-audit-action"),
        actor: value("ca-audit-actor"),
        from: from ? `${from}T00:00:00.000Z` : "",
        to: to ? `${to}T23:59:59.999Z` : "",
        limit: 25
    };
}

function filteredDemoEvents(filters) {
    void filters;
    return [];
}

function formatTimestamp(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(document.documentElement.lang || "sr", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function humanize(value) {
    return String(value || "").replaceAll("_", " ").replace(/\b\w/g, char => char.toUpperCase());
}

function actionLabel(action) {
    const translated = t(`ca_audit_event_${action}`);
    return translated === `ca_audit_event_${action}` ? humanize(action) : translated;
}

function roleLabel(role) {
    if (role === "company_admin") return t("role_company_admin");
    if (role === "dispatcher") return t("dispatcher");
    if (role === "driver") return t("driver");
    return role || "—";
}

/** Prefer display name; never show raw email as the primary actor label. */
function actorLabel(event) {
    const name = String(event?.actorName || "").trim();
    const role = roleLabel(event?.actorRole);
    if (name && !name.includes("@")) return name;
    if (name.includes("@")) {
        const local = name.split("@")[0]?.trim();
        if (local) return local;
    }
    if (role && role !== "—") return role;
    const id = String(event?.actorId || "").trim();
    if (id && id.length <= 12) return id;
    return t("ca_audit_actor_unknown") !== "ca_audit_actor_unknown" ? t("ca_audit_actor_unknown") : "Staff";
}

function renderDetails(details) {
    const entries = Object.entries(details || {});
    if (!entries.length) return `<span class="company-audit-no-details">${escapeHtml(t("ca_audit_no_details"))}</span>`;
    return entries.map(([key, value]) => {
        const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
        return `<span><b>${escapeHtml(humanize(key))}</b>${escapeHtml(rendered)}</span>`;
    }).join("");
}

function renderSummary() {
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = String(value); };
    set("ca-audit-stat-total", events.length);
    set("ca-audit-stat-access", events.filter(event => event.category === "access").length);
    set("ca-audit-stat-operations", events.filter(event => ["drivers", "plans", "scheduling"].includes(event.category)).length);
}

function renderAuditList() {
    const container = document.getElementById("ca-audit-list");
    if (!container) return;
    renderSummary();
    if (loading && !events.length) {
        container.innerHTML = `<div class="company-audit-state"><span class="spinner"></span>${escapeHtml(t("ca_audit_loading"))}</div>`;
        return;
    }
    if (!events.length) {
        container.innerHTML = `<div class="company-audit-state"><i data-lucide="search-x"></i><strong>${escapeHtml(t("ca_audit_empty"))}</strong><span>${escapeHtml(t("ca_audit_empty_hint"))}</span></div>`;
        if (typeof lucide !== "undefined") lucide.createIcons();
        return;
    }
    const rows = events.map(event => `<tr>
        <td data-label="${escapeHtml(t("ca_audit_when"))}"><time datetime="${escapeHtml(event.timestamp)}">${escapeHtml(formatTimestamp(event.timestamp))}</time></td>
        <td data-label="${escapeHtml(t("ca_audit_action"))}"><span class="company-audit-action"><i data-lucide="${event.category === "access" ? "key-round" : event.category === "plans" ? "route" : event.category === "drivers" ? "contact-round" : event.category === "scheduling" ? "calendar-clock" : "settings-2"}"></i>${escapeHtml(actionLabel(event.action))}</span><small>${escapeHtml(t(`ca_audit_category_${event.category}`))}</small></td>
        <td data-label="${escapeHtml(t("ca_audit_actor"))}"><strong>${escapeHtml(actorLabel(event))}</strong><small>${escapeHtml(roleLabel(event.actorRole))}</small></td>
        <td data-label="${escapeHtml(t("ca_audit_details"))}"><div class="company-audit-details">${renderDetails(event.details)}</div></td>
        <td data-label="${escapeHtml(t("ca_audit_source"))}"><span class="company-audit-source ${event.source === "server" ? "is-server" : ""}">${escapeHtml(t(event.source === "server" ? "ca_audit_source_server" : "ca_audit_source_reported"))}</span></td>
    </tr>`).join("");
    container.innerHTML = `<div class="company-audit-table-wrap"><table class="company-audit-table"><thead><tr><th>${escapeHtml(t("ca_audit_when"))}</th><th>${escapeHtml(t("ca_audit_action"))}</th><th>${escapeHtml(t("ca_audit_actor"))}</th><th>${escapeHtml(t("ca_audit_details"))}</th><th>${escapeHtml(t("ca_audit_source"))}</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${nextCursor ? `<button type="button" class="btn-secondary company-audit-more" ${actionAttr("loadMoreCompanyAudit")} ${loading ? "disabled" : ""}><i data-lucide="chevrons-down"></i>${escapeHtml(t(loading ? "ca_audit_loading" : "ca_audit_load_more"))}</button>` : ""}`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function loadCompanyAudit({ append = false } = {}) {
    if (loading || window.currentUser?.role !== "company-admin") return;
    loading = true;
    if (!append) { events = []; nextCursor = null; }
    renderAuditList();
    try {
        const filters = readFilters();
        if (USE_LOCAL_STATE) {
            events = filteredDemoEvents(filters);
            nextCursor = null;
        } else {
            const result = await ApiClient.getCompanyAudit(window.currentUser.companyId, { ...filters, cursor: append ? nextCursor : "" });
            if (!result.success) throw new Error(result.error || t("ca_audit_failed"));
            events = append ? [...events, ...(result.events || [])] : (result.events || []);
            nextCursor = result.nextCursor || null;
        }
    } catch (error) {
        showToast(error.message || t("ca_audit_failed"), "error");
    } finally {
        loading = false;
        renderAuditList();
    }
}

/** Browsers/password managers often dump a saved login email into the first "User" filter. */
function scrubAuditCredentialAutofill() {
    for (const id of ["ca-audit-actor", "ca-audit-action"]) {
        const node = document.getElementById(id);
        if (!node) continue;
        const filled = String(node.value || "");
        let autofilled = false;
        try { autofilled = node.matches(":-webkit-autofill"); } catch { /* non-WebKit */ }
        if (autofilled || filled.includes("@")) {
            node.value = "";
        }
    }
}

function renderCompanyAdminAudit() {
    scrubAuditCredentialAutofill();
    // Late password-manager fills often arrive after first paint.
    requestAnimationFrame(scrubAuditCredentialAutofill);
    setTimeout(scrubAuditCredentialAutofill, 80);
    setTimeout(scrubAuditCredentialAutofill, 400);
    loadCompanyAudit();
}
function refreshCompanyAudit() { loadCompanyAudit(); }
function loadMoreCompanyAudit() { loadCompanyAudit({ append: true }); }
function handleCompanyAuditFilters() { clearTimeout(filterTimer); filterTimer = setTimeout(() => loadCompanyAudit(), 250); }
function resetCompanyAuditFilters() {
    ["ca-audit-category", "ca-audit-action", "ca-audit-actor", "ca-audit-from", "ca-audit-to"].forEach(id => { const node = document.getElementById(id); if (node) node.value = ""; });
    loadCompanyAudit();
}

export { renderCompanyAdminAudit, refreshCompanyAudit, loadMoreCompanyAudit, handleCompanyAuditFilters, resetCompanyAuditFilters };
