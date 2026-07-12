// BusCommand ESM
export const FRESH_STATE = {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [],
    dispatchers: [
        { id: "superadmin", name: "Super Admin", pin: "admin123", isSuperAdmin: true }
    ],
    drivers: [],
    buses: [],
    routes: [],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: {
        name: "",
        primaryColor: "#2DD4BF",
        logo: null
    },
    schedules: [],
    tomorrowShifts: [],
    onboardingDone: false,
    companyAdminOnboardingDone: false,
    activeGroupFilter: null,
    shifts: [],
    companyAdmins: [],
    shiftCatalog: null,
    shiftCatalogs: {},
    bereitschaftDriver: null
};

// ============================================================
// DEMO STATE — jednostavan online test (Linija 101, 2 vozača)
// Nalozi: vidi PROJEKAT-STATUS.md / README.md
// ============================================================
export const DEMO_STATE = {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [
        { id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "demo" }
    ],
    dispatchers: [
        { id: "superadmin", name: "Super Admin", pin: "admin123", isSuperAdmin: true },
        {
            id: "dispo-1",
            name: "Demo Dispatcher",
            email: "demo@buscommand.com",
            password: "demo123",
            passwordChanged: true,
            groups: ["101"],
            companyId: "demo",
            paymentStatus: "Trial",
            trialDaysLeft: 30
        }
    ],
    drivers: [
        {
            id: "drv-1",
            name: "Alex Driver",
            pin: "1234",
            bus: "101",
            groupId: "101",
            lineId: "101",
            active: false,
            companyId: "demo"
        },
        {
            id: "drv-2",
            name: "Sam Driver",
            pin: "1234",
            bus: "102",
            groupId: "101",
            lineId: "101",
            active: false,
            companyId: "demo"
        }
    ],
    buses: [
        { id: "bus-101", number: "101", groupId: "101", lineId: "101", companyId: "demo" },
        { id: "bus-102", number: "102", groupId: "101", lineId: "101", companyId: "demo" }
    ],
    routes: [
        { id: "route-101", name: "Line 101", groupId: "101" }
    ],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: {
        name: "BusCommand",
        primaryColor: "#3D7EF5",
        logo: null
    },
    schedules: [],
    tomorrowShifts: [],
    onboardingDone: true,
    companyAdminOnboardingDone: true,
    activeGroupFilter: null,
    shifts: [],
    companyAdmins: [
        {
            id: "ca-demo-1",
            name: "Demo Admin",
            email: "admin@demo.com",
            password: "demo123",
            companyId: "demo",
            role: "company-admin",
            createdAt: "2026-01-01T00:00:00.000Z"
        }
    ],
    shiftCatalog: null,
    shiftCatalogs: {},
    bereitschaftDriver: null
};
