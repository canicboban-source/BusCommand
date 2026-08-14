// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { saveMonthlyPlan } from "../core/shift-plan.js";
import { renderDispatcherDataHub } from "../dispatcher/data-hub.js";
import { extractTextFromScheduleFile, parseExtractedScheduleText } from "./schedule-import-utils.js";
import { t } from "../ui/i18n.js";

const MAX_SCHEDULE_FILE_BYTES = 600 * 1024;
const ALLOWED_SCHEDULE_EXTENSIONS = new Set(["xlsx", "xls", "pdf", "csv", "txt"]);

function validateScheduleFile(file) {
    if (!file || file.size < 1 || file.size > MAX_SCHEDULE_FILE_BYTES) return false;
    const extension = String(file.name || "").toLowerCase().split(".").pop();
    return ALLOWED_SCHEDULE_EXTENSIONS.has(extension);
}

async function uploadDriverSchedule(event) {
    event.preventDefault();
    const driverName = document.getElementById("upload-schedule-driver").value;
    const month = document.getElementById("upload-schedule-month").value;
    const fileInput = document.getElementById("upload-schedule-file");

    if (!fileInput.files || fileInput.files.length === 0) return;

    const file = fileInput.files[0];
    if (!validateScheduleFile(file)) {
        showToast(t("schedule_file_invalid"), "error", 5000);
        return;
    }
    const submitBtn = event.target.querySelector("button[type='submit']");
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `<span>${t("js_analyzing_plan")}</span> <i class="active-pulse" data-lucide="loader"></i>`;
    submitBtn.disabled = true;

    try {
        const { text, fileData } = await extractTextFromScheduleFile(file);
        const parseResult = parseExtractedScheduleText(text);

        if (parseResult.quality === "empty") {
            showToast(t("error_upload") || "Nije moguće parsirati plan — proverite format fajla.", "error", 5000);
            return;
        }

        if (parseResult.quality === "partial") {
            showToast(`Parsirano samo ${parseResult.dayCount} dana — proverite u tabeli pre objave.`, "info", 5000);
        }

        saveMonthlyPlan(driverName, month, parseResult.shifts, {
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileData,
            parseQuality: parseResult.quality
        });

        saveState();
        fileInput.value = "";
        showToast(t("js_alert_upload_success") || "Mesečni plan uvezen!", "success", 4000);
    } catch (e) {
        console.error("Upload error", e);
        showToast(t("error_upload") || "Greška pri uvozu dokumenta.", "error", 4000);
    } finally {
        submitBtn.innerHTML = originalBtnHtml;
        submitBtn.disabled = false;
        renderDispatcherDataHub();
    }
}

export {
    MAX_SCHEDULE_FILE_BYTES,
    validateScheduleFile,
    uploadDriverSchedule
};
