// BusCommand — arhiva dispečerskih poruka (soft-hide, ne briše podatke)
import { saveState } from "../core/state.js";
import { t } from "../ui/i18n.js";

export const ACTIVE_MSG_LIMIT = 40;
export const ARCHIVE_MSG_LIMIT = 30;

export function getDispatcherName() {
    return window.currentUser?.name || t("dispatcher") || "Dispečer";
}

export function isDispArchived(msg) {
    const dispName = getDispatcherName();
    return Boolean(msg.dispArchivedBy?.includes(dispName));
}

export function isGroupScopeMessage(msg) {
    return msg.scope === "group";
}

export function archiveMessageForDispatcher(id) {
    const msg = (window.state.messages || []).find(m => m.id === id);
    if (!msg) return false;
    const dispName = getDispatcherName();
    if (!msg.dispArchivedBy) msg.dispArchivedBy = [];
    if (!msg.dispArchivedBy.includes(dispName)) msg.dispArchivedBy.push(dispName);
    saveState();
    return true;
}

export function archiveAllForDispatcherTab(tab) {
    const wantGroup = tab === "group";
    const dispName = getDispatcherName();
    let count = 0;
    (window.state.messages || []).forEach(msg => {
        if (isDispArchived(msg)) return;
        const isGroup = isGroupScopeMessage(msg);
        if (wantGroup ? !isGroup : isGroup) return;
        if (!msg.dispArchivedBy) msg.dispArchivedBy = [];
        if (!msg.dispArchivedBy.includes(dispName)) {
            msg.dispArchivedBy.push(dispName);
            count++;
        }
    });
    if (count > 0) saveState();
    return count;
}

export function getActiveMessagesForTab(tab, limit = ACTIVE_MSG_LIMIT) {
    const wantGroup = tab === "group";
    return (window.state.messages || [])
        .filter(m => !isDispArchived(m))
        .filter(m => wantGroup ? isGroupScopeMessage(m) : !isGroupScopeMessage(m))
        .slice(0, limit);
}

export function getArchivedMessagesForTab(tab, limit = ARCHIVE_MSG_LIMIT) {
    const wantGroup = tab === "group";
    return (window.state.messages || [])
        .filter(m => isDispArchived(m))
        .filter(m => wantGroup ? isGroupScopeMessage(m) : !isGroupScopeMessage(m))
        .slice(0, limit);
}

export function countArchivedForTab(tab) {
    const wantGroup = tab === "group";
    return (window.state.messages || []).filter(m =>
        isDispArchived(m) && (wantGroup ? isGroupScopeMessage(m) : !isGroupScopeMessage(m))
    ).length;
}
