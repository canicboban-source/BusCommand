import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

describe("Driver Service Worker Push & Notification Click (Slice 1B)", () => {
  let swCode;
  let swContext;
  let eventListeners;
  let shownNotifications;
  let focusedClients;
  let openedWindows;
  let notificationClosed;

  beforeEach(() => {
    swCode = fs.readFileSync(path.resolve("public/sw-driver.js"), "utf8");
    eventListeners = {};
    shownNotifications = [];
    focusedClients = [];
    openedWindows = [];
    notificationClosed = false;

    swContext = {
      self: {
        location: { origin: "https://buscommand.example" },
        addEventListener: (event, handler) => {
          eventListeners[event] = handler;
        },
        skipWaiting: async () => {},
        registration: {
          showNotification: async (title, options) => {
            shownNotifications.push({ title, options });
          }
        },
        clients: {
          claim: async () => {},
          matchAll: async () => [
            {
              url: "https://buscommand.example/driver.html",
              focus: async () => {
                focusedClients.push("https://buscommand.example/driver.html");
                return true;
              }
            }
          ],
          openWindow: async (url) => {
            openedWindows.push(url);
            return { url };
          }
        }
      },
      caches: {
        open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => null }),
        keys: async () => [],
        delete: async () => true,
        match: async () => null
      },
      URL,
      Set,
      Promise,
      console: { log: () => {}, warn: () => {}, error: () => {} }
    };

    vm.createContext(swContext);
    vm.runInContext(swCode, swContext);
  });

  it("registers push and notificationclick listeners in sw-driver.js", () => {
    assert.strictEqual(typeof eventListeners["push"], "function", "Must register 'push' listener");
    assert.strictEqual(typeof eventListeners["notificationclick"], "function", "Must register 'notificationclick' listener");
  });

  it("push event displays generic operational notification and safe icon/badge", async () => {
    let waitedPromise = null;
    const fakePushEvent = {
      data: {
        json: () => ({
          notification: {
            title: "Sensitive Driver Name / Shift 102",
            body: "Dangerous personal data: Route 4A, Driver John Doe, PIN 1234",
            tag: "custom-shift-tag"
          },
          data: {
            eventType: "shift_assignment",
            externalUrl: "https://attacker.example/phish"
          }
        })
      },
      waitUntil: (p) => { waitedPromise = p; }
    };

    await eventListeners["push"](fakePushEvent);
    if (waitedPromise) await waitedPromise;

    assert.strictEqual(shownNotifications.length, 1);
    const notif = shownNotifications[0];

    // Notification title and body must remain generic
    assert.strictEqual(notif.title, "BusCommand");
    assert.strictEqual(notif.options.body, "Imate novu operativnu poruku.");
    assert.strictEqual(notif.options.icon, "/brand/logo-icon-192.png");
    assert.strictEqual(notif.options.badge, "/brand/logo-icon-192.png");
    assert.strictEqual(notif.options.tag, "custom-shift-tag");
    assert.strictEqual(notif.options.data.eventType, "shift_assignment");
    // Ensure no externalUrl or sensitive data was attached
    assert.strictEqual(notif.options.data.externalUrl, undefined);
  });

  it("malformed push event payload does not throw unhandled rejection", async () => {
    let waitedPromise = null;
    const malformedPushEvent = {
      data: {
        json: () => { throw new SyntaxError("Unexpected token in JSON"); }
      },
      waitUntil: (p) => { waitedPromise = p; }
    };

    await assert.doesNotReject(async () => {
      await eventListeners["push"](malformedPushEvent);
      if (waitedPromise) await waitedPromise;
    });

    assert.strictEqual(shownNotifications.length, 1);
    assert.strictEqual(shownNotifications[0].title, "BusCommand");
  });

  it("notification click closes notification and focuses existing same-origin driver window", async () => {
    let waitedPromise = null;
    const fakeClickEvent = {
      notification: {
        close: () => { notificationClosed = true; },
        data: {
          url: "https://attacker.example/malicious",
          link: "https://attacker.example/phish"
        }
      },
      waitUntil: (p) => { waitedPromise = p; }
    };

    await eventListeners["notificationclick"](fakeClickEvent);
    if (waitedPromise) await waitedPromise;

    assert.strictEqual(notificationClosed, true, "Notification must be closed on click");
    assert.strictEqual(focusedClients.length, 1, "Must focus existing driver window");
    assert.strictEqual(openedWindows.length, 0, "Should not open a new window when existing is focused");
  });

  it("notification click opens new window to fixed /driver.html when no existing window exists", async () => {
    // Override clients to return empty array
    swContext.self.clients.matchAll = async () => [];

    let waitedPromise = null;
    const fakeClickEvent = {
      notification: {
        close: () => { notificationClosed = true; },
        data: { url: "https://attacker.example/evil" }
      },
      waitUntil: (p) => { waitedPromise = p; }
    };

    await eventListeners["notificationclick"](fakeClickEvent);
    if (waitedPromise) await waitedPromise;

    assert.strictEqual(openedWindows.length, 1);
    assert.strictEqual(openedWindows[0], "https://buscommand.example/driver.html", "Must only open same-origin driver.html");
  });

  it("notification click ignores cross-origin or non-driver windows and opens /driver.html", async () => {
    // Return a cross-origin window and a /staff.html window
    swContext.self.clients.matchAll = async () => [
      {
        url: "https://attacker.example/driver.html",
        focus: async () => { focusedClients.push("cross-origin"); return true; }
      },
      {
        url: "https://buscommand.example/staff.html",
        focus: async () => { focusedClients.push("staff-window"); return true; }
      }
    ];

    let waitedPromise = null;
    const fakeClickEvent = {
      notification: {
        close: () => { notificationClosed = true; },
        data: {}
      },
      waitUntil: (p) => { waitedPromise = p; }
    };

    await eventListeners["notificationclick"](fakeClickEvent);
    if (waitedPromise) await waitedPromise;

    assert.strictEqual(focusedClients.length, 0, "Must not focus cross-origin or staff windows");
    assert.strictEqual(openedWindows.length, 1, "Must open clean /driver.html window");
    assert.strictEqual(openedWindows[0], "https://buscommand.example/driver.html");
  });

  it("crafted javascript: or data: urls in payload data cannot alter destination", async () => {
    swContext.self.clients.matchAll = async () => [];

    let waitedPromise = null;
    const maliciousClickEvent = {
      notification: {
        close: () => { notificationClosed = true; },
        data: {
          url: "javascript:alert(document.cookie)",
          link: "data:text/html,<script>alert(1)</script>",
          action: "//attacker.example/evil"
        }
      },
      waitUntil: (p) => { waitedPromise = p; }
    };

    await eventListeners["notificationclick"](maliciousClickEvent);
    if (waitedPromise) await waitedPromise;

    assert.strictEqual(openedWindows.length, 1);
    assert.strictEqual(openedWindows[0], "https://buscommand.example/driver.html");
  });
});
