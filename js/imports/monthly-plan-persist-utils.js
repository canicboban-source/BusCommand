function normalizeType(shift) {
    const allowed = new Set([
        "morning", "afternoon", "night", "bereitschaft", "off", "vacation", "sick"
    ]);
    const type = String(shift?.type || "morning").toLowerCase();
    return allowed.has(type) ? type : "morning";
}

function findDriverByName(drivers, driverName) {
    const needle = String(driverName || "").trim().toLocaleLowerCase();
    return (drivers || []).find((driver) => String(driver.name || "").trim().toLocaleLowerCase() === needle) || null;
}

export { normalizeType, findDriverByName };
