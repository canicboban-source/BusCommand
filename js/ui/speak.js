// BusCommand ESM v9.5

// --- GLASOVNA NAJAVA PORUKA (TEXT-TO-SPEECH) ---
function speakMessage(text, lang) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        
        // Očisti tekst od eventualnih HTML tagova
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = text;
        const cleanText = tempDiv.textContent || tempDiv.innerText || "";
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        let langCode = 'de-DE';
        if (lang === 'en') langCode = 'en-US';
        else if (lang === 'sr') langCode = 'sr-RS';
        
        utterance.lang = langCode;
        
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang.startsWith(langCode));
        if (voice) {
            utterance.voice = voice;
        }
        
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.error("Greška pri reprodukciji glasa:", e);
    }
}
export {
    speakMessage
};
