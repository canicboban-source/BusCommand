/**
 * Lazy-load SheetJS / PDF.js only when an import path needs them (Ch17).
 * Keeps staff login/first paint free of heavy parser CDNs.
 */

const XLSX_SRC = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

const pending = new Map();

function loadScript(src) {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("office_parsers_no_document"));
  }
  const existing = document.querySelector(`script[data-bc-office-src="${src}"]`);
  if (existing) {
    if (pending.has(src)) return pending.get(src);
    return Promise.resolve();
  }
  if (pending.has(src)) return pending.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.bcOfficeSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`office_parsers_load_failed:${src}`));
    document.head.appendChild(script);
  });
  pending.set(src, promise);
  return promise.finally(() => {
    // Keep resolved promise for subsequent callers via existing script tag.
  });
}

async function ensureXlsx() {
  if (typeof globalThis.XLSX !== "undefined") return globalThis.XLSX;
  await loadScript(XLSX_SRC);
  if (typeof globalThis.XLSX === "undefined") {
    throw new Error("ca_plan_err_xlsx_missing");
  }
  return globalThis.XLSX;
}

async function ensurePdfJs() {
  if (typeof globalThis.pdfjsLib !== "undefined") {
    if (!globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
    return globalThis.pdfjsLib;
  }
  await loadScript(PDFJS_SRC);
  if (typeof globalThis.pdfjsLib === "undefined") {
    throw new Error("ca_plan_err_pdfjs_missing");
  }
  globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return globalThis.pdfjsLib;
}

async function ensureTesseract() {
  if (typeof globalThis.Tesseract !== "undefined") return globalThis.Tesseract;
  await loadScript(TESSERACT_SRC);
  if (typeof globalThis.Tesseract === "undefined") {
    throw new Error("ca_plan_err_tesseract_missing");
  }
  return globalThis.Tesseract;
}

export { ensureXlsx, ensurePdfJs, ensureTesseract, XLSX_SRC, PDFJS_SRC, TESSERACT_SRC };
