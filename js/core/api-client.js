// BusCommand ESM — API klijent (produkcija)

import Auth from "./auth-client.js";

const ApiClient = (() => {
    async function _getToken() {
        if (Auth && Auth.getIdToken) return Auth.getIdToken();
        return null;
    }

    async function apiFetch(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (!headers["Content-Type"] && options.body) {
            headers["Content-Type"] = "application/json";
        }
        const token = await _getToken();
        if (token) headers["Authorization"] = "Bearer " + token;
        const res = await window.fetch(path, { ...options, headers });

        let data;
        try {
            data = await res.json();
        } catch {
            data = { success: false, error: "Nevalidan odgovor servera." };
        }

        if (!res.ok) {
            return {
                success: false,
                error: (data && data.error) || ("HTTP " + res.status),
                status: res.status,
                details: data && data.details
            };
        }

        return data;
    }

    async function getConfig() { return apiFetch("/api/config"); }
    async function getLicense(companyId) {
        return apiFetch("/api/license/" + encodeURIComponent(companyId));
    }
    async function getCompanies() { return apiFetch("/api/admin/companies"); }
    async function setCompanyStatus(companyId, status, reason) {
        return apiFetch("/api/admin/company/" + encodeURIComponent(companyId) + "/status", {
            method: "POST",
            body: JSON.stringify({ status, reason: reason || null })
        });
    }
    async function createCompany(data) {
        return apiFetch("/api/admin/create-company", { method: "POST", body: JSON.stringify(data) });
    }
    async function createUser(data) {
        return apiFetch("/api/admin/create-user", { method: "POST", body: JSON.stringify(data) });
    }

    return {
        fetch: apiFetch, getConfig, getLicense, getCompanies,
        setCompanyStatus, createCompany, createUser
    };
})();

export { ApiClient };
export default ApiClient;
