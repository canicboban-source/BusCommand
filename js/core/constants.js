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
// DEMO STATE — prazan dispečerski sandbox (uvoz iz fajlova)
// ============================================================
export const DEMO_STATE = {
    language: "de",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [],
    dispatchers: [
        { id: "superadmin", name: "Super Admin", pin: "admin123", isSuperAdmin: true },
        { id: "dispo-1", name: "dispo 1", email: "dispo1@demo.com", password: "dispo123", passwordChanged: true, groups: [], companyId: "demo", paymentStatus: "Trial", trialDaysLeft: 30 },
        { id: "dispo-2", name: "dispo 2", email: "dispo2@demo.com", password: "dispo123", passwordChanged: true, groups: [], companyId: "demo", paymentStatus: "Trial", trialDaysLeft: 30 },
        { id: "dispo-3", name: "dispo 3", email: "dispo3@demo.com", password: "dispo123", passwordChanged: true, groups: [], companyId: "demo", paymentStatus: "Trial", trialDaysLeft: 30 }
    ],
    drivers: [],
    buses: [],
    routes: [],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: {
        name: "BusCommand Demo",
        primaryColor: "#2DD4BF",
        logo: null
    },
    schedules: [],
    onboardingDone: true,
    companyAdminOnboardingDone: false,
    activeGroupFilter: null,
    shifts: [],
    tomorrowShifts: [],
    companyAdmins: [
        {
            id: "ca-demo-1",
            name: "Ana Kovačević",
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
