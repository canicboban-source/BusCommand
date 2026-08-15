const BRAND_NAME_MIN = 2;
const BRAND_NAME_MAX = 80;
const BRAND_LOGO_HTTPS_MAX = 2048;
const BRAND_LOGO_DATA_MAX = 350000;
const BRAND_LOGO_URL_MAX = BRAND_LOGO_DATA_MAX;
const DEFAULT_BRAND_COLOR = "#2563EB";
const BRAND_LOGO_DATA_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i;

function normalizeBrandColor(value) {
    const color = String(value || "").trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(color) ? color : "";
}

function normalizeBrandLogoUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return { value: "", error: "" };

    if (raw.startsWith("data:")) {
        if (raw.length > BRAND_LOGO_DATA_MAX) return { value: "", error: "logo_too_long" };
        if (!BRAND_LOGO_DATA_RE.test(raw)) return { value: "", error: "logo_file_type" };
        return { value: raw, error: "" };
    }

    if (raw.length > BRAND_LOGO_HTTPS_MAX) return { value: "", error: "logo_too_long" };

    try {
        const url = new URL(raw);
        if (url.protocol !== "https:") return { value: "", error: "logo_https" };
        if (url.username || url.password) return { value: "", error: "logo_credentials" };
        return { value: url.href, error: "" };
    } catch {
        return { value: "", error: "logo_invalid" };
    }
}

function validateBrandingDraft(input = {}) {
    const name = String(input.name || "").trim();
    const primaryColor = normalizeBrandColor(input.primaryColor);
    const logo = normalizeBrandLogoUrl(input.logoUrl);
    const errors = {};

    if (name.length < BRAND_NAME_MIN) errors.name = "name_short";
    else if (name.length > BRAND_NAME_MAX) errors.name = "name_long";
    if (!primaryColor) errors.primaryColor = "color_invalid";
    if (logo.error) errors.logoUrl = logo.error;

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: {
            name,
            primaryColor: primaryColor || DEFAULT_BRAND_COLOR,
            logoUrl: logo.value
        }
    };
}

function brandingDraftEquals(left = {}, right = {}) {
    const a = validateBrandingDraft(left).value;
    const b = validateBrandingDraft(right).value;
    return a.name === b.name && a.primaryColor === b.primaryColor && a.logoUrl === b.logoUrl;
}

/**
 * Read an image file, optionally downscale, and return a data URL suitable for branding.logoUrl.
 */
function readBrandLogoFile(file, {
    maxBytes = 2 * 1024 * 1024,
    maxEdge = 512,
    maxDataUrlLength = BRAND_LOGO_DATA_MAX
} = {}) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(Object.assign(new Error("No file"), { code: "logo_file_missing" }));
            return;
        }
        const type = String(file.type || "").toLowerCase();
        if (!["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"].includes(type)) {
            reject(Object.assign(new Error("Unsupported type"), { code: "logo_file_type" }));
            return;
        }
        if (file.size > maxBytes) {
            reject(Object.assign(new Error("File too large"), { code: "logo_file_large" }));
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(Object.assign(new Error("Read failed"), { code: "logo_file_read" }));
        reader.onload = () => {
            const result = String(reader.result || "");
            if (type === "image/gif" || type === "image/webp" || type === "image/png") {
                if (result.length <= maxDataUrlLength && BRAND_LOGO_DATA_RE.test(result)) {
                    resolve(result);
                    return;
                }
            }
            const image = new Image();
            image.onload = () => {
                const scale = Math.min(1, maxEdge / Math.max(image.width || 1, image.height || 1));
                const width = Math.max(1, Math.round((image.width || 1) * scale));
                const height = Math.max(1, Math.round((image.height || 1) * scale));
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(Object.assign(new Error("Canvas unavailable"), { code: "logo_file_read" }));
                    return;
                }
                ctx.drawImage(image, 0, 0, width, height);
                let quality = 0.9;
                let dataUrl = canvas.toDataURL("image/jpeg", quality);
                while (dataUrl.length > maxDataUrlLength && quality > 0.45) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL("image/jpeg", quality);
                }
                if (dataUrl.length > maxDataUrlLength || !BRAND_LOGO_DATA_RE.test(dataUrl)) {
                    reject(Object.assign(new Error("Encoded logo too large"), { code: "logo_too_long" }));
                    return;
                }
                resolve(dataUrl);
            };
            image.onerror = () => reject(Object.assign(new Error("Invalid image"), { code: "logo_file_type" }));
            image.src = result;
        };
        reader.readAsDataURL(file);
    });
}

export {
    BRAND_LOGO_DATA_MAX,
    BRAND_LOGO_HTTPS_MAX,
    BRAND_LOGO_URL_MAX,
    BRAND_NAME_MAX,
    BRAND_NAME_MIN,
    DEFAULT_BRAND_COLOR,
    brandingDraftEquals,
    normalizeBrandColor,
    normalizeBrandLogoUrl,
    readBrandLogoFile,
    validateBrandingDraft
};
