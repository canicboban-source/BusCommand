function safeDriverExportRows(records, companyId, allowUnscoped = false) {
    return (records || [])
        .filter(driver => driver.companyId === companyId || (allowUnscoped && !driver.companyId))
        .map(driver => [driver.name, driver.bus, driver.groupId || ""]);
}

export { safeDriverExportRows };
