// BusCommand ESM v9.5
function dayseed(index) {
    const today = new Date();
    // Vraća determinističku vrednost na osnovu dana u mesecu i indeksa
    return today.getDate() + index;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
            // Pretvara YYYY-MM-DD u DD.MM.
            return `${parseInt(parts[2])}.${parseInt(parts[1])}.`;
        }
        return dateStr;
    } catch (_err) {
        return dateStr;
    }
}
export {
    dayseed,
    formatDate
};
