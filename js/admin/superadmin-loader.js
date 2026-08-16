/**
 * D17: the Super Admin panel (63 KB source) is role-gated — only SA
 * sessions ever open it. Same race-safe lazy-loader contract as the
 * monthly plan-import chunk: shared in-flight Promise, failed loads are
 * never cached permanently, single module instance.
 */
import { createLazyModuleLoader } from "../dispatcher/plan-import-loader.js";

const loader = createLazyModuleLoader(() => import("./superadmin.js"));

export function loadSuperadminModule() {
    return loader.load();
}
