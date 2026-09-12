// Package-import adapter for driver CSV. Parser is the shared canonical contract.
// Never maps PIN / company_code / activation / password columns onto a driver.

import contractNs from "./driver-import-contract.cjs";

const contract = contractNs?.parseDriverCsv ? contractNs : (contractNs?.default || contractNs);

const CREDENTIAL_PROFILE_KEYS = Object.freeze([
    "pin",
    "initialPin",
    "initial_pin",
    "company_code",
    "activation_code",
    "password",
    "passcode",
    "otp",
    "activationOtp",
    "companyCode"
]);

function parseDriverCsv(text) {
    return contract.parseDriverCsv(text);
}

function stripCredentialFields(record) {
    const next = { ...(record || {}) };
    for (const key of CREDENTIAL_PROFILE_KEYS) delete next[key];
    return next;
}

function localDriverRecordFromCanonical(driver, { id, groupId, companyId } = {}) {
    const firstName = String(driver?.first_name || "").trim();
    const lastName = String(driver?.last_name || "").trim();
    return stripCredentialFields({
        id,
        eid: String(driver?.eid || "").trim(),
        firstName,
        lastName,
        name: [firstName, lastName].filter(Boolean).join(" "),
        email: driver?.email || "",
        phone: driver?.phone || "",
        postalCode: driver?.postal_code || "",
        companyId: companyId || "",
        groupId,
        active: false,
        codeActivated: false
    });
}

export {
    parseDriverCsv,
    localDriverRecordFromCanonical,
    stripCredentialFields,
    CREDENTIAL_PROFILE_KEYS
};
