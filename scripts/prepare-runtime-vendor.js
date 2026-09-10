void (async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const crypto = await import("node:crypto");

  const root = process.cwd();
  const sourceRoot = path.join(root, "node_modules");
  const outputRoot = path.join(root, "runtime-vendor");

  const assets = [
    ["firebase-browser-sdk/firebase-app-compat.js", "firebase/firebase-app-compat.js"],
    ["firebase-browser-sdk/firebase-auth-compat.js", "firebase/firebase-auth-compat.js"],
    ["firebase-browser-sdk/firebase-firestore-compat.js", "firebase/firebase-firestore-compat.js"],
    ["lucide/dist/umd/lucide.min.js", "lucide/lucide.min.js"],
    ["leaflet/dist/leaflet.js", "leaflet/leaflet.js"],
    ["leaflet/dist/leaflet.css", "leaflet/leaflet.css"],
    ["leaflet/dist/images/marker-icon.png", "leaflet/images/marker-icon.png"],
    ["leaflet/dist/images/marker-icon-2x.png", "leaflet/images/marker-icon-2x.png"],
    ["leaflet/dist/images/marker-shadow.png", "leaflet/images/marker-shadow.png"],
    ["xlsx/dist/xlsx.full.min.js", "office/xlsx.full.min.js"],
    ["pdfjs-dist/legacy/build/pdf.mjs", "office/pdf.mjs"],
    ["pdfjs-dist/legacy/build/pdf.worker.mjs", "office/pdf.worker.mjs"]
  ];

  fs.rmSync(outputRoot, {
    recursive: true,
    force: true
  });

  for (const [sourceRelative, targetRelative] of assets) {
    const source = path.join(sourceRoot, sourceRelative);
    const target = path.join(outputRoot, targetRelative);

    if (!fs.existsSync(source)) {
      throw new Error(`runtime_vendor_source_missing:${sourceRelative}`);
    }

    fs.mkdirSync(path.dirname(target), {
      recursive: true
    });

    fs.copyFileSync(source, target);

    const bytes = fs.readFileSync(target);
    const hash = crypto
      .createHash("sha256")
      .update(bytes)
      .digest("hex")
      .toUpperCase();

    console.log(`${targetRelative} | ${bytes.length} bytes | ${hash}`);
  }

  console.log(`Prepared ${assets.length} deterministic runtime-vendor assets.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});