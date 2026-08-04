// BusCommand — arhiva dispečerskih poruka (soft-hide, ne briše podatke)
import { saveState } from "../core/state.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { showToast } from "../core/utils.js";

export const ACTIVE_MSG_LIMIT = 40;
export const ARCHIVE_MSG_LIMIT = 30;

export function getDispatcherName() {
    return window.currentUser?.name || t("dispatcher") || "Dispečer";
}

function staffArchiveId() {
    return window.currentUser?.uid || window.currentUser?.id || null;
}

export function isDispArchived(msg) {
    const uid = staffArchiveId();
    if (uid && Array.isArray(msg?.dispArchivedByIds) && msg.dispArchivedByIds.includes(uid)) {
        return true;
    }
    // Legacy local-only name list (demo / pre-Ch11)
    const dispName = getDispatcherName();
    return Boolean(msg?.dispArchivedBy?.includes(dispName));
}

export function isGroupScopeMessage(msg) {
    return msg.scope === "group";
}

function markLocalArchive(msg) {
    const uid = staffArchiveId();
    if (uid) {
        if (!Array.isArray(msg.dispArchivedByIds)) msg.dispArchivedByIds = [];
        if (!msg.dispArchivedByIds.includes(uid)) msg.dispArchivedByIds.push(uid);
    }
    const dispName = getDispatcherName();
    if (!msg.dispArchivedBy) msg.dispArchivedBy = [];
    if (!msg.dispArchivedBy.includes(dispName)) msg.dispArchivedBy.push(dispName);
}

export async function archiveMessageForDispatcher(id) {
    const msg = (window.state.messages || []).find(m => m.id === id);
    if (!msg) return false;
    if (isDispArchived(msg)) return true;

    if (!IS_DEMO_MODE) {
        const result = await ApiClient.archiveStaffMessage(id);
        if (!result?.success) {
            showToast(result?.error || t("msg_archive_failed") || "Arhiviranje nije uspelo.", "error");
            return false;
        }
    }
    markLocalArchive(msg);
    if (IS_DEMO_MODE) saveState();
    return true;
}

export async function archiveAllForDispatcherTab(tab) {
    const wantGroup = tab === "group";
    const candidates = (window.state.messages || []).filter((msg) => {
        if (isDispArchived(msg)) return false;
        const isGroup = isGroupScopeMessage(msg);
        return wantGroup ? isGroup : !isGroup;
    });
    if (!candidates.length) return 0;

    let count = 0;
    for (const msg of candidates) {
        const ok = await archiveMessageForDispatcher(msg.id);
        if (ok) count += 1;
    }
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
