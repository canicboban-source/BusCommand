#!/usr/bin/env node
/**
 * Izvlači onclick/onchange/onsubmit handlere iz index.html i svih JS fajlova, te generiše js/register-onclick.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "index.html");

const INLINE_EXTRA = ["t", "applyBrandingSettings", "deleteGroup", "deleteDriver", "deleteBus", "deleteRoute", "deleteReport", "addDriver", "getScheduleByKey", "clickElementById", "removeElementById"];

const IGNORE_NAMES = new Set(["this", "event", "return", "if", "getElementById", "document", "stopPropagation"]);

function extractHandlerNames() {
    const names = new Set();
    const re = /on(?:click|change|drop|submit)\s*=\s*\\?["']([^"'\\]+)\\?["']/gi;
    const dataRe = /data-(?:change-|submit-)?action\s*=\s*["']([A-Za-z_$][\w$]*)["']/g;
    const actionAttrRe = /actionAttr\s*\(\s*["']([A-Za-z_$][\w$]*)["']/g;
    const changeAttrRe = /changeAttr\s*\(\s*["']([A-Za-z_$][\w$]*)["']/g;
    
    function collectDataHandlers(source) {
        let dm;
        dataRe.lastIndex = 0;
        while ((dm = dataRe.exec(source)) !== null) names.add(dm[1]);
        actionAttrRe.lastIndex = 0;
        while ((dm = actionAttrRe.exec(source)) !== null) names.add(dm[1]);
        changeAttrRe.lastIndex = 0;
        while ((dm = changeAttrRe.exec(source)) !== null) names.add(dm[1]);
    }
    // 1. Scan index.html
    const html = fs.readFileSync(HTML, "utf8");
    let m;
    while ((m = re.exec(html)) !== null) {
        const expr = m[1];
        const fnRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
        let fm;
        while ((fm = fnRe.exec(expr)) !== null) {
            const name = fm[1];
            if (!IGNORE_NAMES.has(name)) names.add(name);
        }
    }
    while ((m = dataRe.exec(html)) !== null) {
        names.add(m[1]);
    }
    collectDataHandlers(html);

    // 2. Scan all JS files for inline handler strings
    function walkJS(dir) {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            if (ent.isDirectory()) {
                walkJS(path.join(dir, ent.name));
                continue;
            }
            if (!ent.name.endsWith(".js")) continue;
            const code = fs.readFileSync(path.join(dir, ent.name), "utf8");
            let mJS;
            re.lastIndex = 0;
            while ((mJS = re.exec(code)) !== null) {
                const expr = mJS[1];
                const fnRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
                let fm;
                while ((fm = fnRe.exec(expr)) !== null) {
                    const name = fm[1];
                    if (!IGNORE_NAMES.has(name)) names.add(name);
                }
            }
            collectDataHandlers(code);
        }
    }
    walkJS(path.join(ROOT, "js"));

    INLINE_EXTRA.forEach(n => names.add(n));
    return [...names].sort();
}

function buildExportIndex() {
    const index = new Map();
    function walk(dir, prefix) {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
            if (ent.isDirectory()) {
                walk(path.join(dir, ent.name), rel);
                continue;
            }
            if (!ent.name.endsWith(".js")) continue;
            const fullRel = `js/${rel.replace(/\\/g, "/")}`;
            if (fullRel.includes("install.js") || fullRel.includes("register-onclick.js") || fullRel.includes("main.js")) continue;
            const code = fs.readFileSync(path.join(dir, ent.name), "utf8");
            for (const m of code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) index.set(m[1], fullRel);
            for (const m of code.matchAll(/^export\s+const\s+(\w+)\s*=/gm)) index.set(m[1], fullRel);
            const block = code.match(/export\s*\{([^}]+)\}/);
            if (block) {
                block[1].split(",").forEach(part => {
                    const name = part.trim().split(/\s+as\s+/)[0].trim();
                    if (name) index.set(name, fullRel);
                });
            }
        }
    }
    walk(path.join(ROOT, "js"), "");
    return index;
}

function toImportPath(fromFile, targetFile) {
    let rel = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
}

function main() {
    const handlers = extractHandlerNames();
    const exportIndex = buildExportIndex();

    const fromFile = path.join(ROOT, "js", "register-onclick.js");
    const importsByModule = new Map();
    const missing = [];

    for (const name of handlers) {
        if (name === "clickElementById" || name === "removeElementById") {
            continue;
        }
        const mod = exportIndex.get(name);
        if (!mod) {
            missing.push(name);
            continue;
        }
        if (!importsByModule.has(mod)) importsByModule.set(mod, new Set());
        importsByModule.get(mod).add(name);
    }

    const delegateNames = new Set(["installActionDelegates"]);
    if (handlers.includes("clickElementById")) delegateNames.add("clickElementById");
    if (handlers.includes("removeElementById")) delegateNames.add("removeElementById");
    importsByModule.set("js/core/action-delegate.js", delegateNames);

    const importLines = [...importsByModule.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mod, names]) => {
            const sorted = [...names].sort();
            const importPath = toImportPath(fromFile, path.join(ROOT, mod));
            return `import { ${sorted.join(", ")} } from "${importPath}";`;
        });

    const handlerEntries = handlers
        .filter(n => exportIndex.has(n) || n === "clickElementById" || n === "removeElementById")
        .map(n => `    ${n}`);

    const out = `// AUTO-GENERATED — node scripts/generate-register-onclick.js
// onclick/onchange handleri + data-action delegacija (v30)

${importLines.join("\n")}

const __ONCLICK_HANDLERS = {
${handlerEntries.join(",\n")}
};

export function registerOnclickHandlers(win = window) {
    for (const [name, fn] of Object.entries(__ONCLICK_HANDLERS)) {
        if (typeof fn === "function") win[name] = fn;
    }
    installActionDelegates(__ONCLICK_HANDLERS, document);
}
`;

    fs.writeFileSync(fromFile, out);
    console.log("OK js/register-onclick.js —", handlers.length, "handlera");
    if (missing.length) console.warn("Nema export za:", missing.join(", "));
}

main();
