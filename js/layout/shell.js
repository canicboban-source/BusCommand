// BusCommand — surface-aware shell entry (async chunks per surface)
import { isDriverSurface } from "../core/app-surface.js";

export async function showAppLayout() {
    if (isDriverSurface()) {
        const mod = await import("./shell-driver.js");
        return mod.showAppLayout();
    }
    const mod = await import("./shell-staff.js");
    return mod.showAppLayout();
}
