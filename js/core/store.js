// BusCommand ESM — centralni store (window getteri za onclick kompatibilnost)

const store = {
    state: {},
    currentUser: null,
    currentCalendarMonth: new Date().toISOString().slice(0, 7),
    currentShiftWeekOffset: 0,
    scheduleCurrentTab: "upload",
    scheduleSelectedFile: null,
    _saClickCount: 0,
    _saClickTimer: null,
    _licenseInfo: null
};

function defineStoreProp(name) {
    Object.defineProperty(window, name, {
        get() { return store[name]; },
        set(v) { store[name] = v; },
        configurable: true
    });
}

[
    "state", "currentUser", "currentCalendarMonth",
    "currentShiftWeekOffset", "scheduleCurrentTab", "scheduleSelectedFile",
    "_saClickCount", "_saClickTimer", "_licenseInfo"
].forEach(defineStoreProp);

window.FP = window.FP || {};
window.FP.store = store;
