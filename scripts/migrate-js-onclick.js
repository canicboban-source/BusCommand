#!/usr/bin/env node
/**
 * Migrira onclick/onchange u JS modulima (dinamički HTML) na actionAttr/changeAttr.
 * Preskače *.legacy.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "js");

function walk(dir, out = []) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full, out);
        else if (ent.name.endsWith(".js") && !ent.name.endsWith(".legacy.js")) out.push(full);
    }
    return out;
}

function relImport(fromFile) {
    const rel = path.relative(path.dirname(fromFile), path.join(ROOT, "core", "action-delegate.js")).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : "./" + rel;
}

function migrateContent(code) {
    let next = code;

    // onclick="document.getElementById('${id}').remove()"
    next = next.replace(
        /onclick="document\.getElementById\('\$\{([^}]+)\}'\)\.remove\(\)"/g,
        '${actionAttr("removeElementById", [$1])}'
    );

    // onclick="document.getElementById('id').click()" — literal id
    next = next.replace(
        /onclick="document\.getElementById\('([^']+)'\)\.click\(\)"/g,
        '${actionAttr("clickElementById", ["$1"])}'
    );

    // onclick="event.stopPropagation();fn('${a}','${b}')"
    next = next.replace(
        /onclick="event\.stopPropagation\(\);([A-Za-z_$][\w$]*)\('\$\{([^}]+)\}','\$\{([^}]+)\}'\)"/g,
        '${actionAttr("$1", [$2, $3], { stopPropagation: true })}'
    );

    // onclick="${varFn}('${id}')"
    next = next.replace(
        /onclick="\$\{([A-Za-z_$][\w$]*)\}\('\$\{([^}]+)\}'\)"/g,
        '${actionAttr($1, [$2])}'
    );

    // onclick="fn('${var}','${var2}')" — two template vars
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\('\$\{([^}]+)\}','\$\{([^}]+)\}'\)"/g,
        '${actionAttr("$1", [$2, $3])}'
    );

    // onclick="fn('${var}')" — one template var
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\('\$\{([^}]+)\}'\)"/g,
        '${actionAttr("$1", [$2])}'
    );

    // onclick="fn(${num}, ${num2})" — numeric template vars
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\(\$\{([^}]+)\}, \$\{([^}]+)\}\)"/g,
        '${actionAttr("$1", [$2, $3])}'
    );

    // onclick="fn('${a}', '${b}', '${c}', ${n})" — mixed (monthly plan)
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\('\$\{([^}]+)\}', '\$\{([^}]+)\}', '\$\{([^}]+)\}', \$\{([^}]+)\}\)"/g,
        '${actionAttr("$1", [$2, $3, $4, $5])}'
    );

    // onclick="fn('${a}', ${n})"
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\('\$\{([^}]+)\}', \$\{([^}]+)\}\)"/g,
        '${actionAttr("$1", [$2, $3])}'
    );

    // onclick="fn()" — no args
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\(\)"/g,
        '${actionAttr("$1")}'
    );

    // onclick="fn('literal')" — static string in template
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\('([^'\\]*(?:\\.[^'\\]*)*)'\)"/g,
        (_m, fn, arg) => `\${actionAttr("${fn}", ${JSON.stringify([arg.replace(/\\'/g, "'")])})}`
    );

    // onclick="fn(-1)" numeric literal
    next = next.replace(
        /onclick="([A-Za-z_$][\w$]*)\((-?\d+)\)"/g,
        '${actionAttr("$1", [$2])}'
    );

    // onchange="fn('${var}', this.value)"
    next = next.replace(
        /onchange="([A-Za-z_$][\w$]*)\('\$\{([^}]+)\}', this\.value\)"/g,
        '${changeAttr("$1", [$2], "args-value")}'
    );

    // onchange="fn(${idx}, this.value)"
    next = next.replace(
        /onchange="([A-Za-z_$][\w$]*)\(\$\{([^}]+)\}, this\.value\)"/g,
        '${changeAttr("$1", [$2], "args-value")}'
    );

    // onchange="fn()" 
    next = next.replace(
        /onchange="([A-Za-z_$][\w$]*)\(\)"/g,
        '${changeAttr("$1")}'
    );

    return next;
}

function ensureImport(code, file) {
    const usesAction = code.includes("actionAttr(");
    const usesChange = code.includes("changeAttr(");
    if (!usesAction && !usesChange) return code;
    if (code.includes("action-delegate.js")) return code;

    const names = [];
    if (usesAction) names.push("actionAttr");
    if (usesChange) names.push("changeAttr");
    const importLine = `import { ${names.join(", ")} } from "${relImport(file)}";\n`;

    const m = code.match(/^(\/\/[^\n]*\n)?/);
    const header = m ? m[0] : "";
    const rest = code.slice(header.length);
    const importMatch = rest.match(/^((?:import[^\n]+\n)+)/);
    if (importMatch) {
        return header + importMatch[1] + importLine + rest.slice(importMatch[1].length);
    }
    return header + importLine + rest;
}

function migrateFile(file) {
    const original = fs.readFileSync(file, "utf8");
    if (!original.includes("onclick=") && !original.includes("onchange=")) return false;

    let code = migrateContent(original);
    code = ensureImport(code, file);

    if (code !== original) {
        fs.writeFileSync(file, code);
        return true;
    }
    return false;
}

let changed = 0;
for (const file of walk(ROOT)) {
    if (migrateFile(file)) {
        changed += 1;
        console.log("OK", path.relative(path.join(__dirname, ".."), file));
    }
}

// Ručne ispravke koje regex ne pokriva
const manualFixes = [
    {
        file: path.join(ROOT, "data", "groups.js"),
        find: `        const clickAction = isFormedLineGroup(g.id)
            ? \`openGroupHub('\${g.id}')\`
            : \`setGroupFilter('\${g.id}')\`;
        html += \`<button onclick="\${clickAction}" style="`,
        replace: `        const clickAttrs = isFormedLineGroup(g.id)
            ? actionAttr("openGroupHub", [g.id])
            : actionAttr("setGroupFilter", [g.id]);
        html += \`<button \${clickAttrs} style="`
    },
    {
        file: path.join(ROOT, "data", "groups.js"),
        find: `    html += \`<button onclick="setGroupFilter(null)" style="`,
        replace: `    html += \`<button \${actionAttr("setGroupFilter", [null])} style="`
    }
];

for (const fix of manualFixes) {
    let text = fs.readFileSync(fix.file, "utf8");
    if (text.includes(fix.find)) {
        text = text.replace(fix.find, fix.replace);
        text = ensureImport(text, fix.file);
        fs.writeFileSync(fix.file, text);
        console.log("MANUAL", path.relative(path.join(__dirname, ".."), fix.file));
        changed += 1;
    }
}

console.log(`\nMigrirano fajlova: ${changed}`);
