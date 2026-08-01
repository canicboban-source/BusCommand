// BusCommand — driver PWA surface module graph
import { installSharedSurface } from "./install-shared.js";
import "./auth/login-driver.js";
import "./auth/driver-activation.js";
import "./auth/driver-access-gate.js";
import "./layout/pretrip.js";
import "./layout/mobile-nav.js";
import "./driver/dashboard.js";
import "./driver/message-alerts.js";
import "./driver/messages-inbox.js";
import "./driver/avatar.js";
import "./driver/calendar.js";
import "./driver/reports.js";
import "./driver/quick-reports.js";
import "./driver/work-session.js";
import "./maps/gps-track.js";
import "./maps/damage-photo.js";
import "./maps/schedule-viewer.js";
import "./maps/helpers.js";
import "./core/firestore-sync.js";
import { registerDriverSections } from "./surface/register-driver-sections.js";

export function installDriverSurface() {
    installSharedSurface();
    registerDriverSections();
}
