// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, showToast, refreshIcons } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { icon } from "../ui/markup.js";

function switchScheduleTab(tab) {
    window.scheduleCurrentTab = tab;
    const uploadPanel = document.getElementById('sched-panel-upload');
    const textPanel   = document.getElementById('sched-panel-text');
    const tabUpload   = document.getElementById('sched-tab-upload');
    const tabText     = document.getElementById('sched-tab-text');

    if (tab === 'upload') {
        uploadPanel.style.display = '';
        textPanel.style.display   = 'none';
        tabUpload.style.color        = 'var(--primary-color)';
        tabUpload.style.borderBottom = '2px solid var(--primary-color)';
        tabText.style.color          = 'var(--text-muted)';
        tabText.style.borderBottom   = '2px solid transparent';
    } else {
        uploadPanel.style.display = 'none';
        textPanel.style.display   = '';
        tabUpload.style.color        = 'var(--text-muted)';
        tabUpload.style.borderBottom = '2px solid transparent';
        tabText.style.color          = 'var(--primary-color)';
        tabText.style.borderBottom   = '2px solid var(--primary-color)';
    }
}

function handleScheduleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    window.scheduleSelectedFile = file;

    const nameEl    = document.getElementById('schedule-file-name');
    const previewEl = document.getElementById('schedule-file-preview');
    const previewName = document.getElementById('schedule-preview-name');
    const previewContent = document.getElementById('schedule-preview-content');

    nameEl.textContent = file.name;
    nameEl.style.display = 'block';
    previewEl.style.display = '';
    previewName.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;

    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'pdf') {
        previewContent.innerHTML = `<iframe src="${url}" class="bc-doc-frame" height="360px"></iframe>`;
    } else if (['jpg','jpeg','png','webp'].includes(ext)) {
        previewContent.innerHTML = `<img src="${url}" class="bc-doc-img">`;
    } else if (ext === 'txt') {
        const reader = new FileReader();
        reader.onload = e => {
            previewContent.innerHTML = `<pre class="bc-doc-text">${escapeHtml(e.target.result)}</pre>`;
        };
        reader.readAsText(file);
    } else {
        previewContent.innerHTML = `<div class="bc-doc-fallback">
            ${icon("file-text")}
            ${file.name} — preview nije dostupan za ovaj format
        </div>`;
        refreshIcons();
    }
}

function handleScheduleDrop(event) {
    event.preventDefault();
    document.getElementById('schedule-dropzone').style.borderColor = 'var(--panel-border)';
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const fakeInput = { files: [file] };
    handleScheduleFileSelect(fakeInput);
}

function clearScheduleFile() {
    window.scheduleSelectedFile = null;
    const inp = document.getElementById('schedule-file-input');
    if (inp) inp.value = '';
    const nm = document.getElementById('schedule-file-name');
    if (nm) nm.style.display = 'none';
    const pv = document.getElementById('schedule-file-preview');
    if (pv) pv.style.display = 'none';
}

function formatScheduleText(mode) {
    const ta = document.getElementById('schedule-text-input');
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end);
    if (!selected) return;
    const wrapped = mode === 'bold' ? `**${selected}**` : selected;
    ta.value = ta.value.substring(0, start) + wrapped + ta.value.substring(end);
    ta.focus();
    ta.setSelectionRange(start, start + wrapped.length);
}

function insertScheduleTable() {
    const ta = document.getElementById('schedule-text-input');
    if (!ta) return;
    const template = "\n| Linija | Vozač | Polazak | Dolazak |\n|--------|-------|---------|----------|\n|        |       |         |          |\n";
    const pos = ta.selectionStart;
    ta.value = ta.value.substring(0, pos) + template + ta.value.substring(pos);
    ta.focus();
}

function clearScheduleText() {
    const ta = document.getElementById('schedule-text-input');
    if (ta) ta.value = '';
}

async function sendScheduleToDrivers() {
    const dateEl = document.getElementById('schedule-date-picker');
    const date = dateEl && dateEl.value ? dateEl.value : new Date().toISOString().slice(0, 10);
    const textTa = document.getElementById('schedule-text-input');
    const text = textTa ? textTa.value.trim() : '';

    if (!window.scheduleSelectedFile && !text) {
        showToast(t('error_upload') || 'Odaberite fajl ili unesite tekst rasporeda.', 'error');
        return;
    }

    if (!Array.isArray(window.state.schedules)) window.state.schedules = [];

    let data = text;
    let filename = `schedule-${date}.txt`;
    let type = 'text';

    if (window.scheduleSelectedFile) {
        const file = window.scheduleSelectedFile;
        filename = file.name;
        type = file.type || 'application/octet-stream';
        data = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = (e) => resolve(e.target.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    const entry = {
        id: `daily_${date}`,
        date,
        filename,
        type,
        data,
        sentAt: new Date().toISOString()
    };
    const idx = window.state.schedules.findIndex(s => s.id === entry.id);
    if (idx >= 0) window.state.schedules[idx] = entry;
    else window.state.schedules.push(entry);

    saveState();
    showToast(t('js_alert_upload_success') || 'Raspored poslan vozačima.', 'success');
    clearScheduleFile();
    if (textTa) textTa.value = '';
    renderScheduleHistory();
}

// -- VOZAC: prikaz rasporeda --
function renderDriverSchedule(sch) {
    var card = document.getElementById('driver-schedule-card');
    var dateEl = document.getElementById('driver-schedule-date');
    var cont = document.getElementById('driver-schedule-content');
    if (!card || !cont) return;
    if (!sch) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    if (dateEl) dateEl.textContent = sch.date || '';
    var data = sch.data || '';
    var type = sch.type || (data.indexOf('data:image') === 0 ? 'image' :
               data.indexOf('data:application/pdf') === 0 ? 'pdf' : 'text');
    if (type === 'image' || data.indexOf('data:image') === 0) {
        cont.innerHTML = '<img src="' + data + '" class="bc-doc-img">'
    } else if (type === 'pdf' || data.indexOf('data:application/pdf') === 0) {
        cont.innerHTML = '<iframe src="' + data + '" class="bc-doc-frame" height="400px"></iframe>'
    } else {
        var lines = (data || 'Nema rasporeda za danas').split('\n');
        cont.innerHTML = lines.map(function(line) {
            return '<p class="bc-doc-line">' + escapeHtml(line) + '</p>';
        }).join('');
    }
    refreshIcons();
}

function renderScheduleHistory() {
    const container = document.getElementById("schedule-history-list");
    if (!container) return;

    const schedules = window.state.schedules || [];
    if (schedules.length === 0) {
        container.innerHTML = `<p class="bc-empty-note" data-i18n="schedule_history_empty">${t("schedule_history_empty") || "Još nema poslatih rasporeda."}</p>`;
        return;
    }

    // Sort schedules by date or ID descending
    const sorted = [...schedules].sort((a, b) => {
        const dateA = a.date || a.month || "";
        const dateB = b.date || b.month || "";
        return dateB.localeCompare(dateA);
    });

    container.innerHTML = sorted.map(s => {
        const isDaily = s.id.startsWith("daily_");
        const title = isDaily 
            ? `Dnevni raspored: ${s.date}`
            : `Mesečni plan: ${s.driverName} (${s.month})`;
        const filename = s.filename || s.fileName || "Fajl";
        const fileTypeLabel = isDaily ? "Dnevni" : "Mesečni";
        const badgeColor = isDaily ? "var(--primary-color)" : "var(--success-color)";
        
        return `<div class="bc-list-row is-split" style="--bc-chip-color:${badgeColor}">
            <div class="bc-list-main">
                <span class="bc-badge">${fileTypeLabel}</span>
                <span class="bc-list-title">${title}</span>
                <div class="bc-list-sub">📄 ${filename}</div>
            </div>
            <div class="bc-row-actions">
                <a href="${s.data || s.fileData}" download="${filename}" class="btn-secondary bc-mini-link">Preuzmi</a>
                <button ${actionAttr("deleteScheduleEntry", [s.id])} class="bc-mini-btn is-danger is-solid">Obriši</button>
            </div>
        </div>`;
    }).join("");
    
    refreshIcons();
}

function deleteScheduleEntry(id) {
    if (!window.state.schedules) return;
    showConfirm(t("schedule_delete_confirm"), () => {
        window.state.schedules = window.state.schedules.filter(s => s.id !== id);
        saveState();
        renderScheduleHistory();
        showToast(t("schedule_deleted"), "info");
    }, { danger: true });
}

export {
    switchScheduleTab,
    handleScheduleFileSelect,
    handleScheduleDrop,
    clearScheduleFile,
    formatScheduleText,
    insertScheduleTable,
    clearScheduleText,
    sendScheduleToDrivers,
    renderDriverSchedule,
    renderScheduleHistory,
    deleteScheduleEntry
};
