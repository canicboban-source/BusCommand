// BusCommand — dispatcher bus import (TXT / CSV / XLSX / paste)
import {
  classifyBusImport,
  parseBusImportRows,
  parseBusImportText
} from "./bus-import-parse.js";
import { renderBusesList } from "./buses-routes.js";
import { withAttachedGroup, buildNewBusGroups } from "./bus-group-membership.js";
import { saveState } from "../core/state.js";
import { showToast, refreshIcons } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";
import { isOperationalReadOnly } from "../core/access.js";

let pendingImport = null;

function activeGroupId() {
  const hubId = window.state?.activeGroupHubId;
  return hubId || (window.currentUser && window.currentUser.activeGroupId) || null;
}

function companyBuses() {
  return window.state?.buses || [];
}

function upsertLocalBus(bus) {
  if (!bus?.id) return;
  const idx = (window.state.buses || []).findIndex((b) => b.id === bus.id);
  if (idx >= 0) window.state.buses[idx] = { ...window.state.buses[idx], ...bus };
  else window.state.buses.push(bus);
}

function setPreviewHtml(html) {
  const el = document.getElementById("bus-import-preview");
  if (el) el.innerHTML = html;
}

function clearBusImportPreview() {
  pendingImport = null;
  setPreviewHtml("");
  const paste = document.getElementById("bus-import-paste");
  if (paste) paste.value = "";
  const file = document.getElementById("bus-import-file");
  if (file) file.value = "";
}

function renderPreview(parsed, classification, groupId) {
  pendingImport = { parsed, classification, groupId };
  const invalidCount = parsed.invalid.length;
  const createCount = classification.toCreate.length;
  const attachCount = (classification.toAttach || []).length;
  const existCount = classification.existing.length;
  const reactivateCount = classification.toReactivate.length;
  const actionable = createCount || attachCount || reactivateCount;

  setPreviewHtml(`
    <div class="hub-import-preview-body">
      <p><strong>${t("bus_import_preview_title")}</strong></p>
      <ul>
        <li>${t("bus_import_stat_new")}: <strong>${createCount}</strong></li>
        <li>${t("bus_import_stat_attach")}: <strong>${attachCount}</strong></li>
        <li>${t("bus_import_stat_existing")}: <strong>${existCount}</strong></li>
        <li>${t("bus_import_stat_reactivate")}: <strong>${reactivateCount}</strong></li>
        <li>${t("bus_import_stat_invalid")}: <strong>${invalidCount}</strong></li>
      </ul>
      ${actionable
        ? `<button type="button" class="btn-primary" data-action="confirmBusImport">${t("bus_import_confirm")}</button>
           <button type="button" class="btn-secondary" data-action="clearBusImportPreview">${t("bus_import_cancel")}</button>`
        : `<p class="bc-list-sub">${t("bus_import_nothing_to_apply")}</p>
           <button type="button" class="btn-secondary" data-action="clearBusImportPreview">${t("bus_import_cancel")}</button>`}
    </div>
  `);
}

function applyParsedText(text) {
  if (isOperationalReadOnly()) {
    showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
    return;
  }
  const groupId = activeGroupId();
  if (!groupId) {
    showToast(t("bus_import_need_group"), "error");
    return;
  }
  const parsed = parseBusImportText(text);
  if (!parsed.numbers.length && !parsed.invalid.length) {
    showToast(t("bus_import_empty"), "error");
    return;
  }
  const classification = classifyBusImport(parsed.numbers, companyBuses(), groupId);
  renderPreview(parsed, classification, groupId);
}

function handleBusImportPaste() {
  const paste = document.getElementById("bus-import-paste");
  applyParsedText(paste?.value || "");
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function handleBusImportFile(event) {
  const input = event?.target || document.getElementById("bus-import-file");
  const file = input?.files?.[0];
  if (!file) return;

  const name = String(file.name || "").toLowerCase();
  try {
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      let XLSX;
      try {
        const { ensureXlsx } = await import("../core/office-parsers.js");
        XLSX = await ensureXlsx();
      } catch {
        showToast(t("bus_import_xlsx_unavailable"), "error");
        return;
      }
      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const groupId = activeGroupId();
      if (!groupId) {
        showToast(t("bus_import_need_group"), "error");
        return;
      }
      const parsed = parseBusImportRows(rows);
      if (!parsed.numbers.length && !parsed.invalid.length) {
        showToast(t("bus_import_empty"), "error");
        return;
      }
      const classification = classifyBusImport(parsed.numbers, companyBuses(), groupId);
      renderPreview(parsed, classification, groupId);
      return;
    }

    if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
      const text = await readFileAsText(file);
      applyParsedText(text);
      return;
    }

    showToast(t("bus_import_unsupported"), "error");
  } catch (error) {
    console.error(error);
    showToast(t("bus_import_failed"), "error");
  }
}

function handleBusImportDrop(event) {
  event.preventDefault?.();
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  const input = document.getElementById("bus-import-file");
  if (!input) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  handleBusImportFile({ target: input });
}

async function confirmBusImport() {
  if (isOperationalReadOnly()) {
    showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
    return;
  }
  if (!pendingImport) return;
  const { classification, groupId } = pendingImport;
  const createCount = classification.toCreate.length;
  const attachCount = (classification.toAttach || []).length;
  const reactivateCount = classification.toReactivate.length;
  if (!createCount && !attachCount && !reactivateCount) {
    clearBusImportPreview();
    return;
  }

  showConfirm(
    t("bus_import_confirm_body")
      .replace("{new}", String(createCount))
      .replace("{attach}", String(attachCount))
      .replace("{reactivate}", String(reactivateCount)),
    async () => {
      let created = 0;
      let attached = 0;
      let reactivated = 0;
      let failed = 0;

      for (const number of classification.toCreate) {
        try {
          if (!USE_LOCAL_STATE) {
            const result = await ApiClient.createStaffBus(number, groupId);
            if (!result?.success) {
              failed += 1;
              continue;
            }
            upsertLocalBus(result.bus);
          } else {
            const groups = buildNewBusGroups(groupId);
            window.state.buses.push({
              id: `bus-${Date.now()}-${created}`,
              number,
              active: true,
              ...groups
            });
          }
          created += 1;
        } catch {
          failed += 1;
        }
      }

      for (const item of classification.toAttach || []) {
        try {
          if (!USE_LOCAL_STATE) {
            const result = await ApiClient.createStaffBus(item.number, groupId);
            if (!result?.success) {
              failed += 1;
              continue;
            }
            upsertLocalBus(result.bus);
          } else {
            const bus = window.state.buses.find((b) => b.id === item.id);
            if (!bus) {
              failed += 1;
              continue;
            }
            Object.assign(bus, withAttachedGroup(bus, groupId));
          }
          attached += 1;
        } catch {
          failed += 1;
        }
      }

      for (const item of classification.toReactivate) {
        try {
          if (!USE_LOCAL_STATE) {
            const local = window.state.buses.find((b) => b.id === item.id);
            const expectedRevision = Number.isInteger(Number(local?.revision)) && Number(local.revision) >= 0
              ? Number(local.revision)
              : 0;
            const result = await ApiClient.setStaffBusActive(item.id, true, expectedRevision);
            if (!result?.success) {
              failed += 1;
              continue;
            }
            const bus = window.state.buses.find((b) => b.id === item.id);
            if (bus) {
              bus.active = true;
              if (Number.isInteger(result.revision)) bus.revision = result.revision;
              else if (result.bus?.revision != null) bus.revision = result.bus.revision;
            }
          } else {
            const bus = window.state.buses.find((b) => b.id === item.id);
            if (bus) bus.active = true;
          }
          reactivated += 1;
        } catch {
          failed += 1;
        }
      }

      if (USE_LOCAL_STATE) saveState();
      renderBusesList();
      refreshIcons();
      clearBusImportPreview();

      const msg = t("bus_import_done")
        .replace("{created}", String(created))
        .replace("{attached}", String(attached))
        .replace("{reactivated}", String(reactivated))
        .replace("{failed}", String(failed));
      showToast(msg, failed ? "warning" : "success");
    },
    {
      danger: false,
      title: t("bus_import_confirm"),
      confirmText: t("btn_yes") || "OK"
    }
  );
}

export {
  handleBusImportPaste,
  handleBusImportFile,
  handleBusImportDrop,
  confirmBusImport,
  clearBusImportPreview
};
