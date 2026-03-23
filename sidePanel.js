// AccessAI Side Panel Script

const PROXY_URL = "https://sigmashelby-accessai.hf.space";
const PROXY_API_KEY = "REQUESTXTOXGOATEDXAPI";

const welcomeScreen = document.getElementById('welcomeScreen');
const loadingScreen = document.getElementById('loadingScreen');
const resultScreen = document.getElementById('resultScreen');
const errorScreen = document.getElementById('errorScreen');
const resultBody = document.getElementById('resultBody');
const resultType = document.getElementById('resultType');
const readAloudBtn = document.getElementById('readAloudBtn');
const copyBtn = document.getElementById('copyBtn');
const showOriginalBtn = document.getElementById('showOriginalBtn');
const scoreBadge = document.getElementById('scoreBadge');
const simplifyLevel = document.getElementById('simplifyLevel');

let originalText = "";
let simplifiedText = "";

const LEVEL_LABELS = {
  simple: { badge: '🟢 Simplified — Simple', score: 'Easy to Read' },
  standard: { badge: '🔵 Simplified — Standard', score: 'Clear Language' },
  detailed: { badge: '🟡 Simplified — Detailed', score: 'Simplified but Complete' }
};

// Persist level selection
simplifyLevel.addEventListener('change', () => {
  chrome.storage.local.set({ simplifyLevel: simplifyLevel.value });
});
chrome.storage.local.get(['simplifyLevel'], (res) => {
  if (res.simplifyLevel) simplifyLevel.value = res.simplifyLevel;
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SIMPLIFY_TEXT') {
    handleSimplify(message.text);
  } else if (message.type === 'GENERATE_ALT_TEXT') {
    handleAltText(message.url);
  }
});

async function handleSimplify(text) {
  originalText = text;
  showScreen('loading');
  const level = simplifyLevel.value || 'standard';

  try {
    updateUsage();
    const response = await fetch(`${PROXY_URL}/api/simplify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AccessAI-Key': PROXY_API_KEY
      },
      body: JSON.stringify({ text, level })
    });

    const data = await response.json();
    if (data.success) {
      simplifiedText = data.simplified_text;
      resultBody.innerHTML = simplifiedText.replace(/\n/g, '<br>');
      const meta = LEVEL_LABELS[level] || LEVEL_LABELS.standard;
      resultType.textContent = meta.badge;
      scoreBadge.textContent = meta.score;
      showScreen('result');
    } else {
      throw new Error(data.error || "Failed to simplify");
    }
  } catch (err) {
    console.error(err);
    showScreen('error');
  }
}

async function handleAltText(url) {
  showScreen('loading');
  try {
    updateUsage();
    const response = await fetch(`${PROXY_URL}/api/alt-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AccessAI-Key': PROXY_API_KEY
      },
      body: JSON.stringify({ image_url: url })
    });

    const data = await response.json();
    if (data.success) {
      resultBody.innerHTML = `<img src="${url}" style="max-width:100%; border-radius:8px; margin-bottom:12px;"><p>${data.alt_text}</p>`;
      resultType.textContent = "🖼️ Alt Text";
      scoreBadge.textContent = "AI Generated";
      showScreen('result');
    } else {
      throw new Error(data.error || "Failed to generate alt text");
    }
  } catch (err) {
    console.error(err);
    showScreen('error');
  }
}

function showScreen(screen) {
  [welcomeScreen, loadingScreen, resultScreen, errorScreen].forEach(s => s.classList.add('hidden'));
  if (screen === 'welcome') welcomeScreen.classList.remove('hidden');
  else if (screen === 'loading') loadingScreen.classList.remove('hidden');
  else if (screen === 'result') resultScreen.classList.remove('hidden');
  else if (screen === 'error') errorScreen.classList.remove('hidden');
}

// ─── Read Aloud with toggle ────────────────────────────────────────────────
const synth = window.speechSynthesis;
let isReading = false;

readAloudBtn.addEventListener('click', () => {
  if (isReading) {
    synth.cancel();
    isReading = false;
    readAloudBtn.textContent = '🔊 Read';
    return;
  }
  const text = resultBody.innerText;
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.onend = () => { isReading = false; readAloudBtn.textContent = '🔊 Read'; };
  utterance.onerror = () => { isReading = false; readAloudBtn.textContent = '🔊 Read'; };
  synth.speak(utterance);
  isReading = true;
  readAloudBtn.textContent = '⏹ Stop';
});

// ─── Copy to Clipboard ─────────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(resultBody.innerText);
  copyBtn.textContent = '✅ Copied';
  setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
});

// ─── Show Original / Simplified Toggle ────────────────────────────────────
let isShowingOriginal = false;
showOriginalBtn.addEventListener('click', () => {
  isShowingOriginal = !isShowingOriginal;
  if (isShowingOriginal) {
    resultBody.innerHTML = originalText.replace(/\n/g, '<br>');
    showOriginalBtn.textContent = "Show Simplified";
  } else {
    resultBody.innerHTML = simplifiedText.replace(/\n/g, '<br>');
    showOriginalBtn.textContent = "Show Original";
  }
});

// ─── Retry ─────────────────────────────────────────────────────────────────
document.getElementById('retryBtn').addEventListener('click', () => {
  if (originalText) handleSimplify(originalText);
});

function updateUsage() {
  chrome.storage.local.get(['apiUsageToday'], (res) => {
    chrome.storage.local.set({ apiUsageToday: (res.apiUsageToday || 0) + 1 });
  });
}
