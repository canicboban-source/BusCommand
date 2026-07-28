// BusCommand ESM v9.5
import { activeCalendarMonth, scheduleForDriver } from "../driver/calendar.js";
import { t } from "../ui/i18n.js";

function currentDriver() {
    if (!window.currentUser || window.currentUser.role !== "driver") return null;
    return { id: window.currentUser.id || window.currentUser.uid || "", name: window.currentUser.name || "" };
}

function safeScheduleDataUrl(schedule) {
    const value = String(schedule?.fileData || "");
    return /^data:(text\/(plain|csv)|application\/(pdf|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|octet-stream));base64,/i.test(value)
        ? value : "";
}

function appendFileFallback(body, schedule) {
    const wrapper = document.createElement("div");
    wrapper.style.textAlign = "center";
    wrapper.style.padding = "30px";
    wrapper.style.color = "var(--text-muted)";
    const name = document.createElement("strong");
    name.style.display = "block";
    name.style.color = "var(--text-main)";
    name.textContent = schedule.fileName;
    const hint = document.createElement("p");
    hint.textContent = t("schedule_pdf_hint");
    wrapper.append(name, hint);
    body.appendChild(wrapper);
}

function viewUploadedSchedule() {
    const driver = currentDriver();
    if (!driver) return;
    const schedule = scheduleForDriver(driver, activeCalendarMonth());
    const dataUrl = safeScheduleDataUrl(schedule);
    if (!schedule || !dataUrl) return;

    const modal = document.getElementById("schedule-viewer-modal");
    const title = document.getElementById("schedule-viewer-title");
    const body = document.getElementById("schedule-viewer-body");
    const downloadLink = document.getElementById("schedule-download-link");
    if (!modal || !title || !body || !downloadLink) return;

    title.textContent = schedule.fileName;
    body.replaceChildren();
    downloadLink.href = dataUrl;
    downloadLink.download = schedule.fileName.replace(/[\\/:*?"<>|]/g, "_");

    if (/^data:image\//i.test(dataUrl)) {
        const image = document.createElement("img");
        image.src = dataUrl;
        image.alt = schedule.fileName;
        image.style.maxWidth = "100%";
        image.style.maxHeight = "420px";
        image.style.objectFit = "contain";
        body.appendChild(image);
    } else if (/^data:text\/plain;base64,/i.test(dataUrl)) {
        const pre = document.createElement("pre");
        pre.style.whiteSpace = "pre-wrap";
        pre.style.textAlign = "left";
        pre.style.maxHeight = "380px";
        pre.style.overflowY = "auto";
        try {
            const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), char => char.charCodeAt(0));
            pre.textContent = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        } catch {
            pre.textContent = t("schedule_file_read_error");
        }
        body.appendChild(pre);
    } else {
        appendFileFallback(body, schedule);
    }

    modal.classList.remove("hidden");
}

function closeScheduleViewer() {
    document.getElementById("schedule-viewer-modal")?.classList.add("hidden");
}

export { safeScheduleDataUrl, viewUploadedSchedule, closeScheduleViewer };
