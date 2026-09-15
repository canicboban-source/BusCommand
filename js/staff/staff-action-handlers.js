/**
 * Mutable Staff action handler map.
 * Role graphs merge into this object after auth so the single
 * installActionDelegates listener (bound at boot) sees new actions.
 */
import { canInvokeActionDuringDriverActivation } from "../auth/driver-access-gate.js";

/** @type {Record<string, Function>} */
export const staffActionHandlers = Object.create(null);

/**
 * Merge role/shared handlers onto the live staff action map + window.
 * @param {Record<string, Function>} extra
 * @param {Window} [win]
 */
export function mergeStaffActionHandlers(extra, win = window) {
    if (!extra || typeof extra !== "object") return;
    for (const [name, fn] of Object.entries(extra)) {
        if (typeof fn !== "function") continue;
        staffActionHandlers[name] = fn;
        win[name] = (...args) => (canInvokeActionDuringDriverActivation(name) ? fn(...args) : false);
    }
}
