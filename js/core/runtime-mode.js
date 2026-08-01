function isLocalDemoHost(hostname) {
    return hostname === "localhost" || hostname === "127.0.0.1";
}

function resolveRuntimeMode({ hostname, search }) {
    const params = new URLSearchParams(search || "");
    const localDemoAllowed = isLocalDemoHost(hostname);
    const requestedDemoRole = params.get("demo");
    const quickDemoRole = localDemoAllowed && ["driver", "dispatcher"].includes(requestedDemoRole)
        ? requestedDemoRole
        : null;
    const modeParam = params.get("mode");
    const demoRequested = quickDemoRole !== null || modeParam === "demo";
    const productionRequested = modeParam === "production";

    return {
        isLocal: localDemoAllowed,
        isDemoMode: localDemoAllowed && !productionRequested && (demoRequested || modeParam === null),
        quickDemoRole
    };
}

export { isLocalDemoHost, resolveRuntimeMode };
