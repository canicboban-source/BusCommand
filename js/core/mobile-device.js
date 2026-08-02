/**
 * True for real phone/tablet user-agents.
 * Do NOT use viewport width — IDE Simple Browser / split panes are often <768px
 * on a real desktop and must still allow dispatcher login.
 */
function isMobileUserAgent(ua) {
  const value = String(ua || "");
  return /android|iphone|ipad|ipod|blackberry|iemobile|windows phone|opera mini/i.test(value);
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || (typeof window !== "undefined" ? window.opera : "") || "";
  return isMobileUserAgent(ua);
}

export { isMobileUserAgent, isMobileDevice };
