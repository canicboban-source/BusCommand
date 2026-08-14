// BusCommand ESM
export const FRESH_STATE = {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [],
    dispatchers: [],
    drivers: [],
    buses: [],
    routes: [],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: {
        name: "",
        primaryColor: "#2563EB",
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
    servicePlans: [],
    bereitschaftDriver: null
};

// Local/QA mode starts empty as well. Automated fixtures live exclusively under tests/.
export const LOCAL_EMPTY_STATE = FRESH_STATE;
