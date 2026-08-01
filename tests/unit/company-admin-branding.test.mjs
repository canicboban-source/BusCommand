import test from "node:test";
import assert from "node:assert/strict";
import {
  BRAND_LOGO_HTTPS_MAX,
  brandingDraftEquals,
  normalizeBrandColor,
  normalizeBrandLogoUrl,
  validateBrandingDraft
} from "../../js/admin/company-admin-branding-model.js";

test("branding draft trims the name, normalizes color and canonicalizes HTTPS logo", () => {
  const result = validateBrandingDraft({
    name: "  Alpine Transit  ",
    primaryColor: "#10b981",
    logoUrl: "https://assets.example.test/logo.png"
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    name: "Alpine Transit",
    primaryColor: "#10B981",
    logoUrl: "https://assets.example.test/logo.png"
  });
});

test("branding draft rejects unsafe and malformed values", () => {
  assert.equal(validateBrandingDraft({ name: "A", primaryColor: "red", logoUrl: "http://example.test/logo.png" }).valid, false);
  assert.equal(validateBrandingDraft({ name: "Transit", primaryColor: "#3D7EF5", logoUrl: "https://user:pass@example.test/logo.png" }).errors.logoUrl, "logo_credentials");
  assert.equal(normalizeBrandLogoUrl("javascript:alert(1)").error, "logo_https");
  assert.equal(normalizeBrandLogoUrl(`https://example.test/${"a".repeat(BRAND_LOGO_HTTPS_MAX)}`).error, "logo_too_long");
  assert.equal(normalizeBrandColor("#12xz90"), "");
});

test("branding draft accepts compressed data URL logos from file upload", () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const result = validateBrandingDraft({
    name: "Blaguss",
    primaryColor: "#A6001A",
    logoUrl: dataUrl
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.logoUrl, dataUrl);
  assert.equal(normalizeBrandLogoUrl("data:text/html;base64,xxxx").error, "logo_file_type");
});

test("optional logo is accepted and normalized branding equality ignores casing and whitespace", () => {
  assert.equal(validateBrandingDraft({ name: "Transit", primaryColor: "#3d7ef5", logoUrl: "" }).valid, true);
  assert.equal(brandingDraftEquals(
    { name: " Transit ", primaryColor: "#3d7ef5", logoUrl: "" },
    { name: "Transit", primaryColor: "#3D7EF5", logoUrl: "" }
  ), true);
});
