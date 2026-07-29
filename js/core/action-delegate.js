// BusCommand — delegirani data-action / data-change handleri (CSP-friendly)

import { canInvokeActionDuringDriverActivation } from "../auth/driver-access-gate.js";

export function clickElementById(id) {
    document.getElementById(id)?.click();
}

export function removeElementById(id) {
    document.getElementById(id)?.remove();
}

function parseActionArgs(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [raw];
    }
}

function invokeHandler(handlers, name, args, event) {
    if (!canInvokeActionDuringDriverActivation(name)) return false;
    const fn = handlers[name];
    if (typeof fn !== "function") {
        console.warn("[data-action] Nepoznat handler:", name);
        return false;
    }
    if (args.length === 0 && event) {
        fn(event);
    } else {
        fn(...args);
    }
    return true;
}

/**
 * @param {Record<string, Function>} handlers
 * @param {Document|HTMLElement} root
 */
export function installActionDelegates(handlers, root = document) {
    root.addEventListener("click", (event) => {
        const el = event.target.closest("[data-action]");
        if (!el) return;

        if (el.dataset.actionSelf === "true" && event.target !== el) return;

        const name = el.dataset.action;
        if (!name) return;

        if (el.dataset.actionStopPropagation === "true") {
            event.stopPropagation();
        }

        if (el.tagName === "A") {
            event.preventDefault();
        }

        const args = parseActionArgs(el.dataset.actionArgs);
        invokeHandler(handlers, name, args, event);
    });

    root.addEventListener("change", (event) => {
        const el = event.target.closest("[data-change-action]");
        if (!el) return;

        const name = el.dataset.changeAction;
        if (!name) return;

        const args = parseActionArgs(el.dataset.changeActionArgs);
        const pass = el.dataset.changePass || "value";

        if (pass === "args-value") {
            invokeHandler(handlers, name, [...args, el.value], event);
        } else if (args.length > 0) {
            invokeHandler(handlers, name, args, event);
        } else if (pass === "event") {
            invokeHandler(handlers, name, [event], event);
        } else if (pass === "element") {
            invokeHandler(handlers, name, [el], event);
        } else {
            invokeHandler(handlers, name, [el.value], event);
        }
    });

    root.addEventListener("input", (event) => {
        const el = event.target.closest("[data-input-action]");
        if (!el) return;
        const name = el.dataset.inputAction;
        if (!name) return;
        const args = parseActionArgs(el.dataset.inputActionArgs);
        if (args.length > 0) invokeHandler(handlers, name, args, event);
        else invokeHandler(handlers, name, [el.value], event);
    });

    root.addEventListener("submit", (event) => {
        const form = event.target.closest("[data-submit-action]");
        if (!form || event.target !== form) return;

        const name = form.dataset.submitAction;
        if (!name) return;

        event.preventDefault();
        invokeHandler(handlers, name, [event], event);
    });
}

/**
 * Helper za dinamički HTML u JS modulima.
 */
export function actionAttr(name, args, extra = {}) {
    const attrs = [`data-action="${name}"`];
    if (args !== undefined) {
        const arr = Array.isArray(args) ? args : [args];
        attrs.push(`data-action-args='${JSON.stringify(arr)}'`);
    }
    if (extra.self) attrs.push('data-action-self="true"');
    if (extra.stopPropagation) attrs.push('data-action-stop-propagation="true"');
    return attrs.join(" ");
}

/** Helper za dinamički HTML — change handleri */
export function changeAttr(name, args, pass = "value") {
    const attrs = [`data-change-action="${name}"`];
    if (args !== undefined) {
        const arr = Array.isArray(args) ? args : [args];
        attrs.push(`data-change-action-args='${JSON.stringify(arr)}'`);
    }
    if (pass && pass !== "value") attrs.push(`data-change-pass="${pass}"`);
    return attrs.join(" ");
}
