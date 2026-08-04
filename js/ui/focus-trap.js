/**
 * Shared dialog focus trap (§20 / Ch16).
 */
const traps = new WeakMap();

function focusableIn(root) {
  if (!root) return [];
  return [...root.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.getAttribute("aria-hidden") !== "true" && el.offsetParent !== null);
}

function attachFocusTrap(modal, { initialFocus = null } = {}) {
  if (!modal || typeof document === "undefined") return () => {};
  detachFocusTrap(modal);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-hidden", "false");

  const onKeyDown = (event) => {
    if (modal.classList.contains("hidden") || modal.style.display === "none") return;
    if (event.key === "Escape") {
      const closeAction = modal.getAttribute("data-action");
      if (closeAction && typeof window !== "undefined" && typeof window[closeAction] === "function") {
        event.preventDefault();
        event.stopPropagation();
        window[closeAction]();
        return;
      }
      const cancel = modal.querySelector('[data-action="closeModal"], [data-action="closeSosConfirmModal"], [data-action="closeSosTriggerModal"], [data-action="closeConfirmModal"]');
      if (cancel) {
        event.preventDefault();
        event.stopPropagation();
        cancel.click();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = focusableIn(modal);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("keydown", onKeyDown, true);
  traps.set(modal, { onKeyDown, previousFocus });

  requestAnimationFrame(() => {
    const nodes = focusableIn(modal);
    const target = initialFocus && modal.contains(initialFocus) ? initialFocus : nodes[0];
    target?.focus?.();
  });

  return () => detachFocusTrap(modal);
}

function detachFocusTrap(modal) {
  const state = traps.get(modal);
  if (!state) return;
  document.removeEventListener("keydown", state.onKeyDown, true);
  traps.delete(modal);
  const restore = state.previousFocus;
  if (restore && typeof restore.focus === "function" && document.contains(restore)) {
    restore.focus();
  }
}

export { focusableIn, attachFocusTrap, detachFocusTrap };
