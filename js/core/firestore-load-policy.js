const OPERATIONAL_COLLECTION_KEYS = Object.freeze([
    "drivers", "shifts", "messages", "buses", "routes",
    "reports", "vacations", "lostItems", "schedules"
]);

const ROLE_COLLECTION_ALLOWLIST = Object.freeze({
    dispatcher: new Set(OPERATIONAL_COLLECTION_KEYS),
    "company-admin": new Set([...OPERATIONAL_COLLECTION_KEYS, "groups", "dispatchers", "companyAdmins"]),
    company_admin: new Set([...OPERATIONAL_COLLECTION_KEYS, "groups", "dispatchers", "companyAdmins"]),
    driver: new Set(["drivers", "shifts", "messages", "buses", "routes", "reports", "vacations", "lostItems", "schedules"])
});

function allowedGranularCollectionKeys(role) {
    return ROLE_COLLECTION_ALLOWLIST[role] || new Set();
}

function isGranularCollectionAllowed(role, key) {
    return allowedGranularCollectionKeys(role).has(key);
}

export { allowedGranularCollectionKeys, isGranularCollectionAllowed };
