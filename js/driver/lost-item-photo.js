/**
 * Client-side photo sanitize for lost items (§16).
 * Re-encodes via canvas to strip EXIF / GPS metadata before upload.
 */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;
const MAX_DATA_URL_CHARS = 480_000;

async function sanitizeLostItemPhotoFile(file) {
  if (!file) return null;
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error("unsupported_type");
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error("too_large");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    if (!dataUrl.startsWith("data:image/jpeg;base64,")) throw new Error("encode_failed");
    if (dataUrl.length > MAX_DATA_URL_CHARS) throw new Error("too_large");
    const dataBase64 = dataUrl.slice("data:image/jpeg;base64,".length);
    return { contentType: "image/jpeg", dataBase64 };
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}

export { sanitizeLostItemPhotoFile, MAX_DATA_URL_CHARS };
