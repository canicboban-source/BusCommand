#!/usr/bin/env node
/** Produkcioni smoke — node scripts/deploy-smoke.js https://buscommand.com */
const base = (process.argv[2] || "http://localhost:8766").replace(/\/$/, "");

async function check(path, expectStatus = 200) {
  const url = base + path;
  const res = await fetch(url);
  const ok = res.status === expectStatus;
  console.log(ok ? "OK" : "FAIL", res.status, url);
  if (!ok) process.exitCode = 1;
  return res;
}

(async () => {
  console.log("Deploy smoke:", base);
  const health = await check("/api/health");
  const healthJson = await health.json();
  console.log("  health:", healthJson.status, "mode:", healthJson.mode);

  const config = await check("/api/config");
  const configJson = await config.json();
  console.log("  version:", configJson.version, "firebase:", configJson.firebase);

  const home = await check("/?mode=demo");
  const html = await home.text();
  if (html.includes("FleetPulse") || html.includes("Fleet<span")) {
    console.log("FAIL login HTML still contains FleetPulse branding");
    process.exitCode = 1;
  } else {
    console.log("OK no FleetPulse in HTML");
  }
  if (!html.includes("BusCommand") && !html.includes("Bus")) {
    console.log("WARN BusCommand branding not found in HTML (check build)");
  }
})();
