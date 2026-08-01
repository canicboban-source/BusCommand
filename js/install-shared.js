// BusCommand — shared side-effect modules for both surfaces
import "./core/runtime-config.js";
import "./core/auth-client.js";
import "./core/api-client.js";
import "./core/firebase-service.js";
import "./core/store.js";
import "./core/constants.js";
import "./core/utils.js";
import "./core/state.js";
import "./core/line-shift-catalog.js";
import "./core/access.js";
import "./core/shift-plan.js";
import "./core/message-text.js";
import "./core/app-surface.js";
import "./ui/modals.js";
import "./ui/theme.js";
import "./ui/mode-badge.js";
import "./ui/i18n.js";
import "./ui/confirm-modal.js";
import "./ui/speak.js";
import "./sync/cross-tab.js";
import "./auth/login-selects.js";
import "./auth/login-session.js";
import "./auth/password-fields.js";
import "./auth/login-ui.js";
import "./layout/navigation.js";
import "./layout/shell.js";
import "./core/license.js";
import "./maps/sos-siren.js";

export function installSharedSurface() {
    // side-effect imports above
}
