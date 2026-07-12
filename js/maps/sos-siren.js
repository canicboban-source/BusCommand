// BusCommand ESM v9.5

// --- WEB AUDIO API SOS SIRENA ---
let audioCtx = null;
let sirenOscillator = null;
let sirenGainNode = null;
let sirenInterval = null;

function startSOSSiren() {
    if (sirenInterval) return; // Već svira
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    } catch (e) {
        console.error("Web Audio API nije podržan na ovom pretraživaču", e);
        return;
    }
    
    sirenGainNode = audioCtx.createGain();
    sirenGainNode.gain.setValueAtTime(0.25, audioCtx.currentTime); // Umerena jačina zvuka
    sirenGainNode.connect(audioCtx.destination);
    
    sirenOscillator = audioCtx.createOscillator();
    sirenOscillator.type = 'sawtooth'; // Oštriji, piskavi ton alarma
    sirenOscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    sirenOscillator.connect(sirenGainNode);
    sirenOscillator.start();
    
    let stateToggle = false;
    sirenInterval = setInterval(() => {
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        // Naizmenično menjaj visinu tona za sirenu
        sirenOscillator.frequency.setValueAtTime(stateToggle ? 900 : 500, now);
        stateToggle = !stateToggle;
    }, 450);
}

function stopSOSSiren() {
    if (sirenInterval) {
        clearInterval(sirenInterval);
        sirenInterval = null;
    }
    if (sirenOscillator) {
        try {
            sirenOscillator.stop();
            sirenOscillator.disconnect();
        } catch (e) {}
        sirenOscillator = null;
    }
    if (sirenGainNode) {
        sirenGainNode.disconnect();
        sirenGainNode = null;
    }
    if (audioCtx) {
        try {
            audioCtx.close();
        } catch (e) {}
        audioCtx = null;
    }
}
export {
    startSOSSiren,
    stopSOSSiren,
    audioCtx,
    sirenOscillator,
    sirenGainNode,
    sirenInterval
};
