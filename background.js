// AccessAI Background Script

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "simplifyText",          title: "Simplify Text with AccessAI",       contexts: ["selection"] });
  chrome.contextMenus.create({ id: "generateAltText",       title: "Generate Alt Text with AccessAI",   contexts: ["image"] });
  chrome.contextMenus.create({ id: "readAloud",             title: "Read Aloud with AccessAI",          contexts: ["selection"] });
  chrome.contextMenus.create({ id: "toggleHighContrast",    title: "Toggle High Contrast Mode",         contexts: ["all"] });
  chrome.contextMenus.create({ id: "toggleSimplifyButtons", title: "Toggle Simplify Buttons on Page",   contexts: ["all"] });

  chrome.storage.local.get(['apiUsageToday', 'lastResetDate'], (res) => {
    const today = new Date().toDateString();
    if (!res.lastResetDate || res.lastResetDate !== today) {
      chrome.storage.local.set({ apiUsageToday: 0, lastResetDate: today });
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "simplifyText") {
    openSidePanelAndSend(tab.id, { type: 'SIMPLIFY_TEXT', text: info.selectionText });
  } else if (info.menuItemId === "generateAltText") {
    openSidePanelAndSend(tab.id, { type: 'GENERATE_ALT_TEXT', url: info.srcUrl });
  } else if (info.menuItemId === "readAloud") {
    handleSpeak(info.selectionText, true);
  } else if (info.menuItemId === "toggleHighContrast") {
    chrome.storage.local.get(['highContrast'], (res) => {
      const newStatus = !res.highContrast;
      chrome.storage.local.set({ highContrast: newStatus });
      chrome.tabs.sendMessage(tab.id, { type: 'UPDATE_STYLES', settings: { highContrast: newStatus } });
      handleSpeak(newStatus ? "High contrast mode enabled." : "High contrast mode disabled.", true);
    });
  } else if (info.menuItemId === "toggleSimplifyButtons") {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIMPLIFY_BUTTONS' });
  }
});

async function openSidePanelAndSend(tabId, message) {
  await chrome.sidePanel.open({ tabId });
  setTimeout(() => chrome.runtime.sendMessage(message), 500);
}

let lastSpokenText = null;

function handleSpeak(text, interrupt) {
  chrome.tts.isSpeaking((isSpeaking) => {
    // If we click the EXACT SAME read button while it's talking, just stop it (Toggle behavior)
    if (isSpeaking && lastSpokenText === text) {
      chrome.tts.stop();
      lastSpokenText = null;
      return;
    }
    
    // Otherwise, stop current speech and read the new text
    if (interrupt) chrome.tts.stop();
    lastSpokenText = text;
    
    chrome.tts.speak(text, {
      enqueue: !interrupt, rate: 1.0,
      onEvent: (e) => { 
        if (e.type === 'end' || e.type === 'interrupted' || e.type === 'error' || e.type === 'cancelled') {
          if (lastSpokenText === text) lastSpokenText = null;
        }
        if (e.type === 'error') console.error('TTS:', e.errorMessage); 
      }
    });
  });
}

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'SPEAK') {
    handleSpeak(message.text, message.interrupt || false);
    return;
  }

  // ── Voice: inject MediaRecorder into the page's MAIN world ─────────────────
  // We use MediaRecorder (not SpeechRecognition) so we bypass Google's speech
  // servers entirely. Audio goes to our Gemini proxy for transcription.
  if (message.type === 'START_LISTENING') {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      world: 'MAIN',
      func: (maxMs) => {
        // Stop any ongoing session
        if (window._accessaiRecorder && window._accessaiRecorder.state !== 'inactive') {
          window._accessaiRecorder.stop();
          return; // Clicking the button while recording = stop early
        }
        if (window._accessaiStream) {
          window._accessaiStream.getTracks().forEach(t => t.stop());
          window._accessaiStream = null;
        }

        window.postMessage({ source: 'accessai', type: 'VOICE_STATUS', status: 'requesting-mic' }, '*');

        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then(stream => {
            window._accessaiStream = stream;
            const chunks = [];

            // Pick best supported format
            const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', '']
              .find(t => !t || MediaRecorder.isTypeSupported(t));
            const opts = mime ? { mimeType: mime } : {};
            const recorder = new MediaRecorder(stream, opts);
            window._accessaiRecorder = recorder;

            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

            recorder.onstop = () => {
              stream.getTracks().forEach(t => t.stop());
              window._accessaiStream = null;
              window._accessaiRecorder = null;

              if (chunks.length === 0) {
                window.postMessage({ source: 'accessai', type: 'VOICE_ERROR', error: 'no-audio' }, '*');
                return;
              }

              const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
              const reader = new FileReader();
              reader.onload = () => {
                window.postMessage({
                  source: 'accessai',
                  type: 'VOICE_AUDIO',
                  audio: reader.result.split(',')[1], // base64
                  mimeType: recorder.mimeType || 'audio/webm'
                }, '*');
              };
              reader.readAsDataURL(blob);
            };

            // Listen for manual stop command from content script
            const stopHandler = (e) => {
              if (e.data && e.data.source === 'accessai_control' && e.data.type === 'STOP_RECORDING') {
                window.removeEventListener('message', stopHandler);
                if (window._accessaiRecorder && window._accessaiRecorder.state === 'recording') {
                  window._accessaiRecorder.stop();
                }
              }
            };
            window.addEventListener('message', stopHandler);

            recorder.start();
            window.postMessage({ source: 'accessai', type: 'VOICE_STATUS', status: 'recording', maxMs }, '*');

            // Auto-stop after maxMs
            setTimeout(() => {
              window.removeEventListener('message', stopHandler);
              if (window._accessaiRecorder && window._accessaiRecorder.state === 'recording') {
                window._accessaiRecorder.stop();
              }
            }, maxMs);
          })
          .catch(err => {
            const errMap = { NotAllowedError: 'mic-denied', NotFoundError: 'no-mic', NotReadableError: 'mic-busy' };
            window.postMessage({ source: 'accessai', type: 'VOICE_ERROR', error: errMap[err.name] || 'getUserMedia-failed' }, '*');
          });
      },
      args: [8000] // max recording ms
    }).catch(err => {
      console.error('[AccessAI] Injection failed:', err);
      chrome.tabs.sendMessage(tabId, { type: 'VOICE_INJECT_FAILED', reason: err.message });
    });
    return;
  }
});

