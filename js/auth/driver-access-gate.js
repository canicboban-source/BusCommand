const OPERATIONAL_ROOT_IDS = [
    "app-container", "pre-trip-modal", "mobile-bottom-nav", "fp-mobile-nav"
];
const ACTIVATION_ACTIONS = new Set(["openDriverActivation", "cancelDriverActivation", "submitDriverActivation"]);
const detachedRoots = new Map();
let activationPending = false;

function clearDriverFileInputs() {
    const roots = [document, ...Array.from(detachedRoots.values(), entry => entry.node)];
    roots.forEach((root) => root.querySelectorAll?.('input[type="file"]').forEach((input) => { input.value = ""; }));
}

function detachOperationalUi() {
    clearDriverFileInputs();
    for (const id of OPERATIONAL_ROOT_IDS) {
        if (detachedRoots.has(id)) continue;
        const node = document.getElementById(id);
        if (!node?.parentNode) continue;
        const placeholder = document.createComment(`driver-activation-gate:${id}`);
        node.parentNode.replaceChild(placeholder, node);
        detachedRoots.set(id, { node, placeholder });
    }
}

function restoreOperationalUi() {
    for (const { node, placeholder } of detachedRoots.values()) {
        if (placeholder.parentNode) placeholder.parentNode.replaceChild(node, placeholder);
        node.classList.add("hidden");
    }
    detachedRoots.clear();
}

function setDriverActivationPending(pending) {
    activationPending = pending === true;
    window.__BUSCOMMAND_DRIVER_ACTIVATION_PENDING__ = activationPending;
    if (activationPending) detachOperationalUi();
    else restoreOperationalUi();
}

function isDriverActivationPending() {
    return activationPending;
}

function canInvokeActionDuringDriverActivation(actionName) {
    return !activationPending || ACTIVATION_ACTIONS.has(actionName);
}

function canUseDriverOperationalUi() {
    return !activationPending;
}

export {
    setDriverActivationPending,
    isDriverActivationPending,
    canInvokeActionDuringDriverActivation,
    canUseDriverOperationalUi,
    clearDriverFileInputs
};
