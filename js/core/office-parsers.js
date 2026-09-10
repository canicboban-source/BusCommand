/**
 * Lazy-load local SheetJS / PDF.js only when an import path needs them.
 * Tesseract remains an explicitly pinned external boundary until its worker,
 * core and language assets are localized together.
 */

const XLSX_SRC = "/runtime-vendor/office/xlsx.full.min.js";
const PDFJS_SRC = "/runtime-vendor/office/pdf.mjs";
const PDFJS_WORKER = "/runtime-vendor/office/pdf.worker.mjs";
const TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

const pending = new Map();

function loadScript(src) {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("office_parsers_no_document"));
  }

  if (pending.has(src)) return pending.get(src);

  const existing = document.querySelector(
    `script[data-bc-office-src="${src}"]`
  );

  if (existing) return Promise.resolve();

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.bcOfficeSrc = src;

    script.onload = () => resolve();

    script.onerror = () => {
      pending.delete(src);
      script.remove();
      reject(new Error(`office_parsers_load_failed:${src}`));
    };

    document.head.appendChild(script);
  });

  pending.set(src, promise);
  return promise;
}

function loadModule(src) {
  if (pending.has(src)) return pending.get(src);

  const promise = import(/* @vite-ignore */ src).catch((error) => {
    pending.delete(src);
    throw new Error(`office_parsers_module_load_failed:${src}`, {
      cause: error
    });
  });

  pending.set(src, promise);
  return promise;
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
    globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return globalThis.pdfjsLib;
  }

  const pdfjsLib = await loadModule(PDFJS_SRC);

  if (
    typeof pdfjsLib.getDocument !== "function" ||
    !pdfjsLib.GlobalWorkerOptions
  ) {
    throw new Error("ca_plan_err_pdfjs_missing");
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  globalThis.pdfjsLib = pdfjsLib;

  return pdfjsLib;
}

async function ensureTesseract() {
  if (typeof globalThis.Tesseract !== "undefined") {
    return globalThis.Tesseract;
  }

  await loadScript(TESSERACT_SRC);

  if (typeof globalThis.Tesseract === "undefined") {
    throw new Error("ca_plan_err_tesseract_missing");
  }

  return globalThis.Tesseract;
}

export {
  ensureXlsx,
  ensurePdfJs,
  ensureTesseract,
  XLSX_SRC,
  PDFJS_SRC,
  PDFJS_WORKER,
  TESSERACT_SRC
};