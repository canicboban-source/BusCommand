/**
 * CA driver store helpers: sanitized views vs mutable tenant records.
 * Views never expose PIN / OTP / hash / company code / password / login code.
 */

const SECRET_KEYS = [
    "pin",
    "company_code",
    "companyCode",
    "activationOtp",
    "otp",
    "loginCode",
    "password",
    "loginCodeHash",
    "activationCodeHash",
    "companyCodeHash"
];

function stripDriverSecrets(driver) {
    if (!driver || typeof driver !== "object") return driver;
    const next = { ...driver };
    for (const key of SECRET_KEYS) delete next[key];
    return next;
}

function isCompanyDriverInTenant(driver, companyId) {
    return !companyId || !driver?.companyId || driver.companyId === companyId;
}

function viewCompanyDrivers(drivers, companyId) {
    return (drivers || [])
        .filter((driver) => isCompanyDriverInTenant(driver, companyId))
        .map(stripDriverSecrets);
}

function findCompanyDriverRecord(drivers, companyId, driverId) {
    const id = String(driverId || "").trim();
    if (!id) return null;
    return (drivers || []).find((driver) =>
        String(driver?.id) === id && isCompanyDriverInTenant(driver, companyId)
    ) || null;
}

export {
    SECRET_KEYS,
    stripDriverSecrets,
    isCompanyDriverInTenant,
    viewCompanyDrivers,
    findCompanyDriverRecord
};
