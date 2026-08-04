const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeLostItemStatus,
  canTransitionLostItemStatus,
  buildFoundAtFields,
  validateLostItemPhoto,
  publicLostItemPhoto
} = require("../../server/lost-item-lifecycle");

test("normalizes legacy lost-item statuses", () => {
  assert.equal(normalizeLostItemStatus("U depou"), "in_depot");
  assert.equal(normalizeLostItemStatus("stays_on_bus"), "stays_on_bus");
  assert.equal(normalizeLostItemStatus("status_returned"), "returned");
  assert.equal(normalizeLostItemStatus("nope"), null);
});

test("lost-item transitions allow open triad and terminal return", () => {
  assert.equal(canTransitionLostItemStatus("in_depot", "stays_on_bus"), true);
  assert.equal(canTransitionLostItemStatus("stays_on_bus", "in_depot"), true);
  assert.equal(canTransitionLostItemStatus("in_depot", "returned"), true);
  assert.equal(canTransitionLostItemStatus("returned", "in_depot"), false);
  assert.equal(canTransitionLostItemStatus("returned", "returned"), true);
});

test("foundAt fields prefer client timestamp", () => {
  const fields = buildFoundAtFields({
    clientCreatedAt: "2026-08-04T08:15:00.000Z",
    now: new Date("2026-08-04T12:00:00.000Z")
  });
  assert.equal(fields.foundAt, "2026-08-04T08:15:00.000Z");
  assert.equal(fields.date, "2026-08-04");
  assert.equal(fields.time, "08:15");
});

test("photo validation accepts PNG and rejects EXIF JPEG", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
  const ok = validateLostItemPhoto({
    contentType: "image/png",
    dataBase64: png.toString("base64")
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.photo.contentType, "image/png");

  const jpegExif = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66]);
  const bad = validateLostItemPhoto({
    contentType: "image/jpeg",
    dataBase64: jpegExif.toString("base64")
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "exif_present");

  const publicPhoto = publicLostItemPhoto(ok.photo);
  assert.match(publicPhoto.dataUrl, /^data:image\/png;base64,/);
});
