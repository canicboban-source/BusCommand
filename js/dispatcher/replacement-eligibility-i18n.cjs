"use strict";

/**
 * Presentation copy for replacement eligibility (Radar + coverage modal).
 * Separate from the business evaluator so block codes stay language-free.
 */

const ELIGIBILITY_COPY = Object.freeze({
  en: {
    no_candidates: "No eligible replacement for this duty.",
    blocked: "Replacement is not eligible."
  },
  de: {
    no_candidates: "Kein geeigneter Ersatz für diese Schicht.",
    blocked: "Ersatz ist nicht geeignet."
  },
  sr: {
    no_candidates: "Nema podobnog vozača za ovu smenu.",
    blocked: "Zamena nije podobna."
  }
});

function eligibilityMessage(lang, key) {
  const table = ELIGIBILITY_COPY[String(lang || "").trim().toLowerCase()] || ELIGIBILITY_COPY.en;
  return table[key] || ELIGIBILITY_COPY.en[key] || "";
}

module.exports = {
  ELIGIBILITY_COPY,
  eligibilityMessage
};
