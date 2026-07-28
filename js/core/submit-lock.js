const activeSubmissions = new WeakSet();

async function runSingleSubmission(button, creatingText, task) {
    if (!button || activeSubmissions.has(button)) return { started: false };
    activeSubmissions.add(button);
    const label = button.querySelector("span");
    const previousText = label?.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (label) label.textContent = creatingText;
    try {
        return { started: true, value: await task() };
    } finally {
        activeSubmissions.delete(button);
        button.disabled = false;
        button.removeAttribute("aria-busy");
        if (label && previousText != null) label.textContent = previousText;
    }
}

export { runSingleSubmission };
