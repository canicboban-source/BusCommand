import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("office parsers use local safe XLSX and PDF.js assets", () => {
  const loader = read("js/core/office-parsers.js");

  assert.match(
    loader,
    /XLSX_SRC = "\/runtime-vendor\/office\/xlsx\.full\.min\.js"/
  );

  assert.match(
    loader,
    /PDFJS_SRC = "\/runtime-vendor\/office\/pdf\.mjs"/
  );

  assert.match(
    loader,
    /PDFJS_WORKER = "\/runtime-vendor\/office\/pdf\.worker\.mjs"/
  );

  assert.doesNotMatch(loader, /xlsx@0\.18\.5/);
  assert.doesNotMatch(loader, /pdf\.js\/2\.16\.105/);
  assert.doesNotMatch(loader, /cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js/);
});

test("PDF imports disable eval support on every active call path", () => {
  for (const relativePath of [
    "js/imports/service-plan-pdf.js",
    "js/maps/schedule-import-utils.js"
  ]) {
    const source = read(relativePath);

    assert.match(
      source,
      /getDocument\(\{ data: arrayBuffer, isEvalSupported: false \}\)/
    );

    assert.doesNotMatch(
      source,
      /getDocument\(\{\s*data:\s*arrayBuffer\s*\}\)/
    );
  }
});

test("runtime-vendor generator copies exact office assets", () => {
  const generator = read("scripts/prepare-runtime-vendor.js");

  assert.match(generator, /xlsx\/dist\/xlsx\.full\.min\.js/);
  assert.match(generator, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.match(generator, /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/);
  assert.match(generator, /Prepared \$\{assets\.length\}/);
});

test("remaining Tesseract CDN boundary is pinned exactly", () => {
  const loader = read("js/core/office-parsers.js");

  assert.match(
    loader,
    /tesseract\.js@5\.1\.1\/dist\/tesseract\.min\.js/
  );

  assert.doesNotMatch(
    loader,
    /tesseract\.js@5\/dist\/tesseract\.min\.js/
  );
});