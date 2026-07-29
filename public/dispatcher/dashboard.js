// Runtime bridge for Firebase's production-safe renderer callback.
// The dashboard implementation is bundled by Vite and registers this global.
export function renderDispatcherDashboard() {
    if (typeof window.renderDispatcherDashboard !== "function") {
        throw new Error("Dispatcher dashboard renderer is not registered.");
    }
    return window.renderDispatcherDashboard();
}
