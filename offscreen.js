// offscreen.js — runs in the offscreen document context, which CAN use
// webkitSpeechRecognition without the "network" error that content scripts get.

let activeRecognition = null;

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'OFFSCREEN_START_RECOGNITION') {
    startRecognition(message.tabId);
  } else if (message.type === 'OFFSCREEN_STOP_RECOGNITION') {
    if (activeRecognition) {
      activeRecognition.abort();
      activeRecognition = null;
    }
  }
});

function startRecognition(tabId) {
  // Abort any previous session
  if (activeRecognition) {
    activeRecognition.abort();
    activeRecognition = null;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_RESULT', tabId, error: 'unavailable' });
    return;
  }

  const recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;
  activeRecognition = recognition;

  let resultReceived = false;
  let errorHandled = false;

  recognition.onstart = () => {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_STATUS', tabId, status: 'started' });
  };

  recognition.onresult = (e) => {
    resultReceived = true;
    activeRecognition = null;
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_RESULT',
      tabId,
      transcript: e.results[0][0].transcript,
      confidence: e.results[0][0].confidence
    });
  };

  recognition.onerror = (e) => {
    if (errorHandled || resultReceived) return;
    errorHandled = true;
    activeRecognition = null;
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_RESULT', tabId, error: e.error });
  };

  recognition.onend = () => {
    if (!resultReceived && !errorHandled) {
      errorHandled = true;
      activeRecognition = null;
      chrome.runtime.sendMessage({ type: 'OFFSCREEN_RESULT', tabId, error: 'no-speech' });
    }
  };

  recognition.start();
}
