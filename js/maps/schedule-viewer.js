// BusCommand ESM v9.5
import { t } from "../ui/i18n.js";

function viewUploadedSchedule() {
    const scheduleKey = `${window.currentUser.name}_${currentCalendarMonth}`;
    const schedule = getScheduleByKey(scheduleKey);
    
    if (!schedule) return;
    
    const modal = document.getElementById("schedule-viewer-modal");
    const title = document.getElementById("schedule-viewer-title");
    const body = document.getElementById("schedule-viewer-body");
    const downloadLink = document.getElementById("schedule-download-link");
    
    if (!modal || !title || !body || !downloadLink) return;
    
    title.innerText = schedule.fileName;
    body.innerHTML = "";
    
    downloadLink.href = schedule.fileData;
    downloadLink.download = schedule.fileName;
    
    const isImage = (schedule.fileType && schedule.fileType.startsWith("image/")) || 
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(schedule.fileName);
    
    if (isImage) {
        body.innerHTML = `<img src="${schedule.fileData}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:var(--radius-sm); box-shadow: 0 4px 15px rgba(0,0,0,0.4);">`;
    } else if (schedule.fileType === "text/plain") {
        try {
            const base64Content = schedule.fileData.split(",")[1];
            const decodedText = decodeURIComponent(escape(atob(base64Content)));
            body.innerHTML = `<pre style="color:var(--text-main); font-family:monospace; font-size:0.9rem; text-align:left; width:100%; white-space:pre-wrap; background:rgba(0,0,0,0.5); padding:15px; border-radius:var(--radius-sm); max-height:380px; overflow-y:auto; border:1px solid rgba(255,255,255,0.05); margin:0;">${decodedText}</pre>`;
        } catch (_err) {
            body.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">${t("schedule_file_read_error")}</div>`;
        }
    } else {
        body.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
                <i data-lucide="file-text" style="width:64px; height:64px; color:var(--primary-color); display:block; margin:0 auto 15px;"></i>
                <span style="font-size:1.05rem; color:var(--text-main); font-weight:600; display:block; margin-bottom:8px;">${schedule.fileName}</span>
                <span style="font-size:0.85rem; display:block; margin-bottom:20px;">${t("schedule_pdf_loaded")}</span>
                <p style="font-size:0.8rem; max-width:350px; margin:0 auto; line-height:1.4;">${t("schedule_pdf_hint")}</p>
            </div>
        `;
    }
    
    modal.classList.remove("hidden");
    lucide.createIcons();
}

function closeScheduleViewer() {
    const modal = document.getElementById("schedule-viewer-modal");
    if (modal) modal.classList.add("hidden");
}
export {
    viewUploadedSchedule,
    closeScheduleViewer
};
