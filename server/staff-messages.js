"use strict";

const crypto = require("crypto");
const { z } = require("zod");
const { dispatcherCanAccessGroup } = require("./report-lifecycle");

const STAFF_MESSAGE_TEMPLATES = Object.freeze([
  "tmpl_delay_5", "tmpl_delay_10", "tmpl_delay_15", "tmpl_delay_20", "tmpl_delay_30",
  "tmpl_detour", "tmpl_skip_stop", "tmpl_route_end", "tmpl_route_change",
  "tmpl_bus_full", "tmpl_slow_down", "tmpl_pax_check", "tmpl_pax_incident", "tmpl_police",
  "tmpl_shift_now", "tmpl_take_break", "tmpl_end_shift", "tmpl_call_dispatch", "tmpl_help_coming"
]);

const TEMPLATE_SET = new Set(STAFF_MESSAGE_TEMPLATES);

const driverIdSchema = z.string().uuid();
const groupIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

const staffMessageSchema = z.object({
  mode: z.enum(["driver", "group", "broadcast"]),
  recipientDriverId: driverIdSchema.optional(),
  groupId: groupIdSchema.optional(),
  template: z.string().trim().min(1).max(64),
  detail: z.string().trim().max(500).optional().default(""),
  senderLang: z.string().trim().max(8).optional().default("en"),
  senderName: z.string().trim().min(1).max(120).optional(),
  displayScope: z.enum(["driver", "group"]).optional()
}).superRefine((data, ctx) => {
  if (!TEMPLATE_SET.has(data.template)) {
    ctx.addIssue({ code: "custom", path: ["template"], message: "unknown_template" });
  }
  if (data.mode === "driver" && !data.recipientDriverId) {
    ctx.addIssue({ code: "custom", path: ["recipientDriverId"], message: "required" });
  }
  if (data.mode === "group" && !data.groupId) {
    ctx.addIssue({ code: "custom", path: ["groupId"], message: "required" });
  }
  if (data.mode === "broadcast" && (data.recipientDriverId || data.groupId)) {
    ctx.addIssue({ code: "custom", path: ["mode"], message: "broadcast_has_no_target_ids" });
  }
});

function messageTypeForTemplate(template) {
  if (String(template).startsWith("tmpl_delay")) return "warning";
  if (template === "tmpl_call_dispatch" || template === "tmpl_pax_incident") return "urgent";
  if (String(template).startsWith("tmpl_detour") || String(template).startsWith("tmpl_route")) return "detour";
  return "info";
}

function staffCanAccessGroup(staff, groupId) {
  if (!groupId) return false;
  if (staff?.role === "company_admin") return true;
  return dispatcherCanAccessGroup(staff?.groups, groupId);
}

function staffAccessibleDriverIds(staff, drivers) {
  const list = Array.isArray(drivers) ? drivers : [];
  if (staff?.role === "company_admin") {
    return list.filter((driver) => driver.active !== false).map((driver) => driver.id);
  }
  return list
    .filter((driver) => driver.active !== false && staffCanAccessGroup(staff, driver.groupId || driver.lineId))
    .map((driver) => driver.id);
}

function resolveStaffMessageTargets({ mode, recipientDriverId, groupId, displayScope, staff, drivers, groups }) {
  const byId = new Map((drivers || []).map((driver) => [driver.id, driver]));
  const scope = displayScope === "driver" || displayScope === "group"
    ? displayScope
    : (mode === "driver" ? "driver" : "group");

  if (mode === "driver") {
    const driver = byId.get(recipientDriverId);
    if (!driver || driver.active === false) {
      return { ok: false, status: 404, error: "Vozač nije pronađen." };
    }
    const gid = driver.groupId || driver.lineId || null;
    if (!staffCanAccessGroup(staff, gid)) {
      return { ok: false, status: 403, error: "Pristup vozaču van dodeljene grupe nije dozvoljen." };
    }
    return {
      ok: true,
      broadcast: false,
      scope: "driver",
      targets: [{ driverId: driver.id, driverName: driver.name, groupId: gid }]
    };
  }

  if (mode === "group") {
    if (!staffCanAccessGroup(staff, groupId)) {
      return { ok: false, status: 403, error: "Pristup grupi nije dozvoljen." };
    }
    const group = (groups || []).find((item) => item.id === groupId);
    const targets = (drivers || [])
      .filter((driver) => driver.active !== false && (driver.groupId === groupId || driver.lineId === groupId))
      .map((driver) => ({
        driverId: driver.id,
        driverName: driver.name,
        groupId
      }));
    if (!targets.length) {
      return { ok: false, status: 400, error: "U grupi nema aktivnih vozača." };
    }
    return {
      ok: true,
      broadcast: false,
      scope: "group",
      groupId,
      groupName: group?.name || groupId,
      targets
    };
  }

  // broadcast
  if (staff?.role === "company_admin") {
    return {
      ok: true,
      broadcast: true,
      scope,
      targets: [{ driverId: null, driverName: "ALL", groupId: null }]
    };
  }

  const allowedIds = new Set(staffAccessibleDriverIds(staff, drivers));
  const targets = (drivers || [])
    .filter((driver) => allowedIds.has(driver.id))
    .map((driver) => ({
      driverId: driver.id,
      driverName: driver.name,
      groupId: driver.groupId || driver.lineId || null
    }));
  if (!targets.length) {
    return { ok: false, status: 400, error: "Nema vozača u dodeljenim grupama." };
  }
  return { ok: true, broadcast: false, scope, targets };
}

function buildStaffMessageDoc({
  id,
  now,
  senderName,
  senderUid,
  senderLang,
  template,
  detail,
  type,
  scope,
  broadcast,
  recipientName,
  recipientDriverId,
  groupId
}) {
  const pad = (value) => String(value).padStart(2, "0");
  const dateString = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeString = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const detailText = detail ? String(detail).trim() : "";
  return {
    id,
    date: dateString,
    time: timeString,
    sender: senderName,
    senderId: senderUid,
    senderLang: senderLang || "en",
    recipient: recipientName,
    recipientDriverId: recipientDriverId || null,
    groupId: groupId || null,
    broadcast: broadcast === true,
    template,
    detail: detailText,
    text: template + (detailText ? ` — ${detailText}` : ""),
    type,
    scope,
    read: false
  };
}

function newMessageId() {
  return `msg_${crypto.randomUUID().replace(/-/g, "")}`;
}

module.exports = {
  STAFF_MESSAGE_TEMPLATES,
  staffMessageSchema,
  messageTypeForTemplate,
  staffCanAccessGroup,
  staffAccessibleDriverIds,
  resolveStaffMessageTargets,
  buildStaffMessageDoc,
  newMessageId
};
