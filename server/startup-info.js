function buildStartupInfo({ nodeEnv, hasFirebase, hasDist, port, localIp }) {
  const isPublicRuntime = nodeEnv === "production";
  const mode = isPublicRuntime ? "PREVIEW" : (hasFirebase ? "PRODUKCIJA" : "LOKALNI DEVELOPMENT");
  const lines = [
    "",
    "===========================================",
    "  BusCommand Server v9.4",
    `  Frontend: ${hasDist ? "dist/ (Vite build)" : "js/main.js (dev bundle)"}`,
    `  Režim: ${mode}`,
    "==========================================="
  ];

  if (!isPublicRuntime) {
    lines.push(`  Lokalno:    http://localhost:${port}`);
    lines.push(`  Produkcija: http://localhost:${port}/?mode=production&company=ID`);
    if (localIp && localIp !== "localhost") lines.push(`  Telefon:    http://${localIp}:${port}`);
  }
  lines.push("===========================================", "");
  return { isPublicRuntime, mode, lines };
}

module.exports = { buildStartupInfo };
