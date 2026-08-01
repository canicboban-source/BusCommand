#!/usr/bin/env node
/**
 * Migrira statičke onclick/onchange u index.html na data-action / data-change-action.
 * Složeni inline izrazi (document.getElementById) ostaju ručno posle skripte.
 */
const fs = require("fs");
const path = require("path");

const HTML = path.join(__dirname, "..", "index.html");
let html = fs.readFileSync(HTML, "utf8");
let count = 0;

function replace(regex, replacer) {
    html = html.replace(regex, (...args) => {
        count += 1;
        return typeof replacer === "function" ? replacer(...args) : replacer;
    });
}

// onclick="fn()"
replace(/ onclick="([A-Za-z_$][\w$]*)\(\)"/g, (_m, fn) => ` data-action="${fn}"`);

// onclick="fn('text')"
replace(/ onclick="([A-Za-z_$][\w$]*)\('([^'\\]*(?:\\.[^'\\]*)*)'\)"/g, (_m, fn, arg) => {
    const decoded = arg.replace(/\\'/g, "'");
    return ` data-action="${fn}" data-action-args='${JSON.stringify([decoded])}'`;
});

// onclick="fn(-1)" / onclick="fn(1)"
replace(/ onclick="([A-Za-z_$][\w$]*)\((-?\d+)\)"/g, (_m, fn, num) => {
    return ` data-action="${fn}" data-action-args='[${num}]'`;
});

// onclick="if(event.target===this) closeModal('id')"
replace(
    / onclick="if\(event\.target===this\) ([A-Za-z_$][\w$]*)\('([^']*)'\)"/g,
    (_m, fn, arg) =>
        ` data-action="${fn}" data-action-args='${JSON.stringify([arg])}' data-action-self="true"`
);

// onclick="if(event.target===this) closeModal()"
replace(
    / onclick="if\(event\.target===this\) ([A-Za-z_$][\w$]*)\(\)"/g,
    (_m, fn) => ` data-action="${fn}" data-action-self="true"`
);

// onclick="document.getElementById('id').click()"
replace(/ onclick="document\.getElementById\('([^']+)'\)\.click\(\)"/g, (_m, id) => {
    return ` data-action="clickElementById" data-action-args='${JSON.stringify([id])}'`;
});

// onclick="event.stopPropagation(); switchSection('x')"
replace(
    / onclick="event\.stopPropagation\(\); switchSection\('([^']*)'\)"/g,
    (_m, arg) =>
        ` data-action="switchSection" data-action-args='${JSON.stringify([arg])}' data-action-stop-propagation="true"`
);

// onchange="changeLanguage(this.value)"
replace(/ onchange="changeLanguage\(this\.value\)"/g, ' data-change-action="changeLanguage"');

// onchange="handler(event)"
replace(/ onchange="([A-Za-z_$][\w$]*)\(event\)"/g, (_m, fn) => {
    return ` data-change-action="${fn}" data-change-pass="event"`;
});

// onchange="handler(this)"
replace(/ onchange="([A-Za-z_$][\w$]*)\(this\)"/g, (_m, fn) => {
    return ` data-change-action="${fn}" data-change-pass="element"`;
});

// onchange="handler()"
replace(/ onchange="([A-Za-z_$][\w$]*)\(\)"/g, (_m, fn) => ` data-change-action="${fn}"`);

// onsubmit="handler(event)"
replace(/ onsubmit="([A-Za-z_$][\w$]*)\(event\)"/g, (_m, fn) => {
    return ` data-submit-action="${fn}"`;
});

fs.writeFileSync(HTML, html);
console.log(`OK index.html — ${count} atributa migrirano na data-action`);
