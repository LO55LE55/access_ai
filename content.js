// AccessAI Content Script

// Keep track of current styles
let currentSettings = {
  highContrast: false,
  dyslexiaFont: false,
  colorFilter: 'none',
  fontSize: 16,
  formAssistant: false,
  simplifyHelpers: false
};

// ─── OpenDyslexic Font Injection (faithful port of OpenDyslexic/extension repo) ───
const OD_STYLE_ID = 'accessai-od-style';
const OD_BODY_CLASS = 'accessai-od-regular';

function injectOpenDyslexic() {
  // Remove old style if present (idempotent)
  const old = document.getElementById(OD_STYLE_ID);
  if (old) old.remove();

  const base = chrome.runtime.getURL('opendyslexic-0.92/');
  const style = document.createElement('style');
  style.id = OD_STYLE_ID;
  style.textContent = `
    /* Font face declarations — faithful to OpenDyslexic/extension v2 */
    @font-face {
      font-family: 'OpenDyslexic';
      src: local('OpenDyslexic Regular'), local('OpenDyslexic'),
           url('${base}regular.otf') format('opentype');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'OpenDyslexic';
      src: local('OpenDyslexic Italic'),
           url('${base}italic.otf') format('opentype');
      font-weight: 400;
      font-style: italic;
      font-display: swap;
    }
    @font-face {
      font-family: 'OpenDyslexic';
      src: local('OpenDyslexic Bold'),
           url('${base}bold.otf') format('opentype');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'OpenDyslexic';
      src: local('OpenDyslexic Bold Italic'),
           url('${base}bold-italic.otf') format('opentype');
      font-weight: 700;
      font-style: italic;
      font-display: swap;
    }

    /* Antialiasing on body — same as the official extension */
    body.${OD_BODY_CLASS} {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Apply to all text-bearing elements, but never icons/glyphs/symbols.
       Exact selector pattern from OpenDyslexic/extension source. */
    body.${OD_BODY_CLASS}
      *:not([class*='icon']):not([class*='material'])
        :not([class*='symbols']):not([class*='font'])
        :not([class*='glyph']):not([class*='fa-']):not([class*='bi-']) {
      font-family: 'OpenDyslexic', Arial, sans-serif !important;
      line-height: 1.5;
    }

    /* Bold/strong inherit the bold face */
    body.${OD_BODY_CLASS} b,
    body.${OD_BODY_CLASS} strong {
      font-family: 'OpenDyslexic', Arial, sans-serif !important;
      font-weight: bolder !important;
    }
  `;
  document.head.appendChild(style);
}

function applyOpenDyslexic(enable) {
  if (enable) {
    injectOpenDyslexic();
    document.body.classList.add(OD_BODY_CLASS);
  } else {
    const el = document.getElementById(OD_STYLE_ID);
    if (el) el.remove();
    document.body.classList.remove(OD_BODY_CLASS);
  }
}

// ─── Proxy URL for Gemini API ───────────────────────────────────────────────
const PROXY_URL = "https://sigmashelby-accessai.hf.space";
const PROXY_API_KEY = "REQUESTXTOXGOATEDXAPI";

// Initialize settings from storage
chrome.storage.local.get(['highContrast', 'dyslexiaFont', 'colorFilter', 'fontSize', 'formAssistant', 'simplifyHelpers'], (res) => {
  if (res) {
    currentSettings = { ...currentSettings, ...res };
    applyStyles(currentSettings);
    if (currentSettings.formAssistant) initFormAssistant();
    if (currentSettings.simplifyHelpers) initSimplifyButtons();
  }
});

// Handled by the merged listener below (at line 653)

function speak(text, interrupt = false) {
  // speak() is for UI/TTS narration and respects the voiceFeedback user preference
  chrome.storage.local.get(['voiceFeedback'], (res) => {
    if (res.voiceFeedback) {
      try {
        chrome.runtime.sendMessage({ type: 'SPEAK', text, interrupt });
      } catch (e) { /* extension context invalidated — ignore */ }
    }
  });
}

// speakAloud() is for the on-demand Read button — ALWAYS reads aloud regardless of voiceFeedback
function speakAloud(text) {
  try {
    chrome.runtime.sendMessage({ type: 'SPEAK', text, interrupt: true });
  } catch (e) { /* extension context invalidated — ignore */ }
}

// Form assistant uses browser-native TTS directly so we get reliable onend events
// Uses DUAL guarantee: onend event + character-count fallback (Chrome's onend is buggy)
function speakLocal(text, onDone) {
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.0;

  let fired = false;
  const done = () => {
    if (fired) return;
    fired = true;
    setTimeout(onDone, 650); // Always wait 650ms after speech before opening mic
  };

  utt.onend = done;
  utt.onerror = done;

  // Fallback: estimate duration (~120 wpm average + 500ms padding)
  const estimatedMs = Math.max(2500, (text.split(' ').length / 2) * 1000 + 500);
  setTimeout(done, estimatedMs);

  window.speechSynthesis.speak(utt);
}

function applyStyles(settings) {
  document.documentElement.classList.toggle('accessai-high-contrast', !!settings.highContrast);

  // Dyslexia font — class goes on body (matching official OpenDyslexic/extension)
  applyOpenDyslexic(!!settings.dyslexiaFont);

  document.documentElement.classList.remove('accessai-protanopia', 'accessai-deuteranopia', 'accessai-tritanopia');
  if (settings.colorFilter && settings.colorFilter !== 'none') {
    document.documentElement.classList.add(`accessai-${settings.colorFilter}`);
  }

  const size = parseInt(settings.fontSize) || 16;
  if (size !== 16) {
    document.documentElement.style.setProperty('--accessai-font-size', `${size}pt`);
    if (!document.getElementById('accessai-font-size-style')) {
      const style = document.createElement('style');
      style.id = 'accessai-font-size-style';
      style.textContent = `html.accessai-font-scaled, html.accessai-font-scaled * { font-size: var(--accessai-font-size) !important; }`;
      document.head.appendChild(style);
    }
    document.documentElement.classList.add('accessai-font-scaled');
  } else {
    document.documentElement.classList.remove('accessai-font-scaled');
  }
}

// ─── Universal Form Assistant ────────────────────────────────────────────────
// A single floating container holds all speaker buttons, positioned with JS
let formOverlayContainer = null;
const formBtnMap = new Map(); // input -> button
let formScrollHandler = null;

function initFormAssistant() {
  removeFormAssistant();

  // Container for all floating buttons (avoids layout disruption)
  formOverlayContainer = document.createElement('div');
  formOverlayContainer.id = 'accessai-form-overlay';
  formOverlayContainer.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483646;pointer-events:none;';
  document.body.appendChild(formOverlayContainer);

  const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="search"], input[type="password"], textarea, input:not([type]), select');

  inputs.forEach(input => attachFormBtn(input));

  // Also handle radio groups — one button per fieldset/group
  const radioGroups = {};
  document.querySelectorAll('input[type="radio"]').forEach(radio => {
    const name = radio.name || '_ungrouped';
    if (!radioGroups[name]) radioGroups[name] = [];
    radioGroups[name].push(radio);
  });
  Object.values(radioGroups).forEach(group => attachRadioBtn(group));

  // Reposition on scroll/resize
  formScrollHandler = () => repositionAllBtns();
  window.addEventListener('scroll', formScrollHandler, true);
  window.addEventListener('resize', formScrollHandler);
  repositionAllBtns();
}

function attachFormBtn(input) {
  const btn = document.createElement('button');
  btn.className = 'accessai-form-btn';
  btn.innerHTML = '🎙️';
  btn.title = 'Voice input';
  btn.style.pointerEvents = 'all';
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handleFieldVoice(input, btn); });
  formOverlayContainer.appendChild(btn);
  // Anchor to the input itself for text fields
  formBtnMap.set(input, { btn, anchor: input, position: 'right' });
}

function attachRadioBtn(radios) {
  const btn = document.createElement('button');
  btn.className = 'accessai-form-btn';
  btn.innerHTML = '🎙️';
  btn.title = 'Voice select';
  btn.style.pointerEvents = 'all';
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); handleRadioVoice(radios, btn); });
  formOverlayContainer.appendChild(btn);

  // For radio groups: anchor to the QUESTION text (nearby heading/paragraph) or fieldset legend
  // so the button appears next to the question, not overlapping the tiny circle
  const firstRadio = radios[0];
  let anchor = null;

  // Try: fieldset legend
  const fieldset = firstRadio.closest('fieldset');
  if (fieldset) {
    anchor = fieldset.querySelector('legend') || fieldset;
  }

  // Try: nearest preceding heading or paragraph that contains the question text
  if (!anchor) {
    let node = firstRadio.closest('li, div, section') || firstRadio.parentElement;
    // Walk up to find a block with a heading or bold text
    for (let i = 0; i < 5 && node; i++) {
      const heading = node.querySelector('h1,h2,h3,h4,h5,strong,b,label') || node.previousElementSibling;
      if (heading && heading.innerText?.trim()) { anchor = heading; break; }
      node = node.parentElement;
    }
  }

  // Fallback: nearest label for the first radio
  if (!anchor) {
    anchor = document.querySelector(`label[for="${firstRadio.id}"]`) || firstRadio.parentElement;
  }

  formBtnMap.set(firstRadio, { btn, anchor, position: 'right-of-anchor' });
}

function repositionAllBtns() {
  formBtnMap.forEach((entry, _input) => {
    const { btn, anchor, position } = entry;
    const el = anchor || _input;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.style.position = 'fixed';

    if (position === 'right-of-anchor') {
      // For radio groups: place to the right of the question text
      btn.style.top = `${rect.top + (rect.height / 2) - 14}px`;
      btn.style.left = `${rect.right + 8}px`;
    } else {
      // For text inputs: place INSIDE the input on the right edge (like a password eye)
      // Hide if the input is too narrow (< 40px) to avoid covering it all
      if (rect.width < 40) {
        btn.style.display = 'none';
      } else {
        btn.style.top = `${rect.top + (rect.height / 2) - 14}px`;
        btn.style.left = `${rect.right - 32}px`;
      }
    }
  });
}

function removeFormAssistant() {
  if (formOverlayContainer) { formOverlayContainer.remove(); formOverlayContainer = null; }
  if (formScrollHandler) {
    window.removeEventListener('scroll', formScrollHandler, true);
    window.removeEventListener('resize', formScrollHandler);
    formScrollHandler = null;
  }
  formBtnMap.clear();
}

// ─── Field Name Abbreviation Dictionary ────────────────────────────────────
const FIELD_ABBR = {
  cc: 'Credit Card', ccnumber: 'Credit Card Number', cardnumber: 'Card Number',
  ccn: 'Credit Card Number', cardnum: 'Card Number',
  cvv: 'Security Code', cvv2: 'Security Code', cvc: 'Security Code', csc: 'Security Code',
  exp: 'Expiration Date', expiry: 'Expiry Date', expdate: 'Expiry Date',
  mm: 'Month', yy: 'Year', yyyy: 'Year',
  dob: 'Date of Birth', birthdate: 'Date of Birth', bday: 'Birthday',
  fname: 'First Name', firstname: 'First Name', lname: 'Last Name', lastname: 'Last Name',
  fullname: 'Full Name', uname: 'Username', uname: 'Username', pwd: 'Password', passwd: 'Password',
  addr: 'Address', addr1: 'Address Line 1', addr2: 'Address Line 2',
  zip: 'Zip Code', zipcode: 'Zip Code', postal: 'Postal Code', postcode: 'Postal Code',
  phone: 'Phone Number', tel: 'Phone Number', mobile: 'Mobile Number', mob: 'Mobile Number',
  msg: 'Message', subj: 'Subject', qty: 'Quantity', num: 'Number',
  ssn: 'Social Security Number', iban: 'Bank Account Number'
};

function cleanName(raw) {
  if (!raw) return null;
  // Strip leading numbers/symbols (e.g. "01Title" → "Title", "41ccnumber" → "ccnumber")
  let s = raw.replace(/^[\d\s_\-#.]+/, '');
  // Lowercase for abbreviation lookup
  const lower = s.toLowerCase().replace(/[_\-\s]/g, '');
  if (FIELD_ABBR[lower]) return FIELD_ABBR[lower];
  // Split camelCase: "firstName" → "first Name"
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Replace underscores/hyphens/dots with spaces
  s = s.replace(/[_\-.]/g, ' ');
  // Clean extra whitespace
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getFieldContext(input) {
  // 1. aria-label
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) return cleanName(ariaLabel) || ariaLabel;
  // 2. aria-labelledby
  const ariaLabelledBy = input.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const el = document.getElementById(ariaLabelledBy);
    if (el) return el.innerText.trim();
  }
  // 3. <label for="id">
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) return label.innerText.trim();
  }
  // 4. Wrapping <label>
  const wrapLabel = input.closest('label');
  if (wrapLabel) return wrapLabel.innerText.replace(input.value, '').trim();
  // 5. <legend> inside fieldset
  const fieldset = input.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend) return legend.innerText.trim();
  }
  // 6. Nearest preceding sibling heading/label/paragraph
  let node = input.previousElementSibling || input.parentElement?.previousElementSibling;
  for (let i = 0; i < 5 && node; i++) {
    if (['H1', 'H2', 'H3', 'H4', 'LABEL', 'STRONG', 'P', 'SPAN', 'LI'].includes(node.tagName)) {
      const txt = node.innerText?.trim();
      if (txt && txt.length < 100) return txt;
    }
    node = node.previousElementSibling || node.parentElement?.previousElementSibling;
  }
  // 7. placeholder
  if (input.placeholder) return input.placeholder;
  // 8. name attribute — clean it up
  if (input.name) return cleanName(input.name);
  return null;
}

function getFieldPrompt(input) {
  const ctx = getFieldContext(input);
  const type = (input.type || '').toLowerCase();
  const ctxLow = ctx ? ctx.toLowerCase() : '';

  // Date fields
  if (type === 'date') return `Please say the ${ctx || 'date'}, for example March 20, 2000`;
  if (type === 'month') return `Please say the month and year${ctx ? ' for ' + ctx : ''}, for example March 2000`;
  if (type === 'time') return `Please say the time${ctx ? ' for ' + ctx : ''}, for example 3 30 PM`;

  // Number or text fields that look like date parts
  if (ctxLow.includes('year') || ctxLow.includes('birth') || ctxLow.includes('born'))
    return `Please say the year, for example 1995`;
  if (ctxLow.includes('month'))
    return `Please say the month, for example January, or a number from 1 to 12`;
  if (ctxLow.includes('day') && !ctxLow.includes('birthday'))
    return `Please say the day of the month, for example the 15th`;

  if (ctx) return `Please say the value for: ${ctx}`;
  return `What should go in this field? Please speak now.`;
}

// ─── Debug Log Panel ──────────────────────────────────────────────────────
function accessaiLog(msg) {
  console.log(`[AccessAI] ${msg}`);
}

// ─── Transcription via proxy (Local Whisper) ──────────────────────────────────
// The proxy at PROXY_URL/api/transcribe runs faster-whisper locally on the Space.
function transcribeBlob(blob, mimeType, onResult, onError) {
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    const kb = (base64.length * 0.75 / 1024).toFixed(0);
    accessaiLog(`Transcribing audio (${kb} kb) via local Whisper...`);

    fetch(`${PROXY_URL}/api/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AccessAI-Key': PROXY_API_KEY
      },
      body: JSON.stringify({ audio: base64, mimeType })
    })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.transcript) {
          accessaiLog(`Heard: "${data.transcript}"`);
          onResult(data.transcript);
        } else {
          onError(data.error || 'No transcript returned');
        }
      })
      .catch(err => {
        accessaiLog(`Fetch error: ${err.message}`, 'error');
        onError('Could not reach transcription service. Check your connection.');
      });
  };
  reader.readAsDataURL(blob);
}

// ─── Voice Recording (MediaRecorder in content script) ───────────────────────
let activeVoiceCallback = null;
let activeVoiceErrorCb = null;
let _currentRecorder = null;

function listenForVoice(onResult, onError) {
  activeVoiceCallback = onResult;
  activeVoiceErrorCb = onError;

  if (_currentRecorder && _currentRecorder.state === 'recording') {
    _currentRecorder.stop();
    return;
  }

  accessaiLog('Requesting microphone...', 'info');

  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
      const chunks = [];
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', '']
        .find(t => !t || MediaRecorder.isTypeSupported(t));

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      _currentRecorder = recorder;

      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        _currentRecorder = null;

        if (chunks.length === 0) { _fireError('No audio captured. Please try again.'); return; }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        transcribeBlob(blob, recorder.mimeType || 'audio/webm',
          (transcript) => {
            accessaiLog(`Heard: "${transcript}"`, 'success');
            if (activeVoiceCallback) {
              const cb = activeVoiceCallback;
              activeVoiceCallback = null; activeVoiceErrorCb = null;
              cb(transcript);
            }
          },
          (err) => { _fireError(`Transcription failed: ${err}`); }
        );
      };

      recorder.start();
      accessaiLog('🔴 Recording — speak now. Tap 🔴 button to stop early.', 'success');

      setTimeout(() => {
        if (_currentRecorder && _currentRecorder.state === 'recording') _currentRecorder.stop();
      }, 8000);
    })
    .catch(err => {
      const msgs = {
        NotAllowedError: 'Microphone blocked — click 🔒 in the address bar and allow mic for this site.',
        NotFoundError: 'No microphone found. Please connect one.',
        NotReadableError: 'Microphone is in use by another app.'
      };
      accessaiLog(`getUserMedia: ${err.name}`, 'error');
      _fireError(msgs[err.name] || `Mic error: ${err.message}`);
    });
}

function _fireError(msg) {
  accessaiLog(msg, 'error');
  if (activeVoiceErrorCb) {
    const cb = activeVoiceErrorCb;
    activeVoiceCallback = null; activeVoiceErrorCb = null;
    cb(msg);
  } else {
    activeVoiceCallback = null;
  }
}


let _listeningTimer = null;
function setListeningState(btn, isListening) {
  if (_listeningTimer) { clearInterval(_listeningTimer); _listeningTimer = null; }

  if (isListening) {
    let remaining = 8;
    btn.innerHTML = `🔴 ${remaining}s`;
    btn.title = 'Recording — tap to stop early';
    _listeningTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(_listeningTimer); _listeningTimer = null;
        btn.innerHTML = '⏳'; // hourglass while transcribing
        btn.title = 'Transcribing...';
      } else {
        btn.innerHTML = `🔴 ${remaining}s`;
      }
    }, 1000);
  } else {
    btn.innerHTML = '🎙️';
    btn.title = 'Voice input';
  }
}

function handleFieldVoice(input, btn) {
  const question = getFieldPrompt(input);
  setListeningState(btn, false);

  // Speak the question locally, then start mic only after speech ends
  speakLocal(question, () => {
    setListeningState(btn, true);
    listenForVoice(
      (transcript) => {
        setListeningState(btn, false);

        // --- Added parsing logic ---
        let finalValue = transcript;
        const type = (input.type || '').toLowerCase();
        const name = (input.name || '').toLowerCase();

        if (type === 'email' || name.includes('email') || name.includes('e-mail')) {
          finalValue = finalValue.replace(/\s+at\s+/gi, '@').replace(/\s+dot\s+/gi, '.').replace(/\s+/g, '').toLowerCase();
        }

        if (input.tagName.toLowerCase() === 'select') {
          // Try to match an option
          const lower = finalValue.toLowerCase();
          let matched = null;
          Array.from(input.options).forEach(opt => {
            if (!matched && (opt.value.toLowerCase().includes(lower) || opt.text.toLowerCase().includes(lower) || lower.includes(opt.value.toLowerCase()) || lower.includes(opt.text.toLowerCase()))) {
              matched = opt;
            }
          });
          if (matched) finalValue = matched.value;
        }
        // ---------------------------

        input.value = finalValue;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        speakLocal(`Got it. Set to: ${finalValue}`, () => { });
      },
      (err) => {
        setListeningState(btn, false);
        speakLocal('Sorry, I could not hear that clearly. Please try again.', () => { });
        console.warn('AccessAI voice input error:', err);
      }
    );
  });
}

function handleRadioVoice(radios, btn) {
  const group = radios.map((r, i) => {
    const lbl = document.querySelector(`label[for="${r.id}"]`);
    return `Choice ${i + 1}: ${lbl ? lbl.innerText.trim() : r.value}`;
  }).join('. ');

  const fieldset = radios[0].closest('fieldset');
  const legend = fieldset?.querySelector('legend')?.innerText?.trim();
  const question = legend
    ? `${legend}. Options: ${group}. Which do you choose?`
    : `Options: ${group}. Which do you choose?`;

  speakLocal(question, () => {
    setListeningState(btn, true);
    listenForVoice(
      (transcript) => {
        setListeningState(btn, false);
        const lower = transcript.toLowerCase();
        let matched = null;
        radios.forEach((r, i) => {
          const lbl = document.querySelector(`label[for="${r.id}"]`);
          const labelText = lbl ? lbl.innerText.trim().toLowerCase() : r.value.toLowerCase();
          if (lower.includes(labelText) || lower.includes(`choice ${i + 1}`) || lower.includes(String(i + 1))) {
            matched = r;
          }
        });
        if (matched) {
          matched.checked = true;
          matched.dispatchEvent(new Event('change', { bubbles: true }));
          speakLocal(`Selected: ${matched.value}`, () => { });
        } else {
          speakLocal(`I heard "${transcript}" but couldn't match a choice. Try speaking the exact option name.`, () => { });
        }
      },
      (err) => {
        setListeningState(btn, false);
        speakLocal('Sorry, I could not hear that. Please try again.', () => { });
      }
    );
  });
}

// ─── Inline Text Simplification ─────────────────────────────────────────────
let simplifyButtonsActive = false;
let lastSimplifyTime = 0;
const SIMPLIFY_COOLDOWN_MS = 12000;

function initSimplifyButtons() {
  if (simplifyButtonsActive) return;
  simplifyButtonsActive = true;
  const paragraphs = document.querySelectorAll('p, h1, h2, h3, li, blockquote');
  paragraphs.forEach(el => {
    if (el.dataset.accessaiWrapped) return;
    if (!el.innerText || el.innerText.trim().length < 75) return;
    el.dataset.accessaiWrapped = '1';
    el.style.position = 'relative';

    const btn = document.createElement('button');
    btn.className = 'accessai-simplify-btn';
    btn.textContent = '✨ Simplify';
    btn.title = 'Simplify this text with AI';
    el.appendChild(btn);

    const readBtn = document.createElement('button');
    readBtn.className = 'accessai-simplify-btn';
    readBtn.textContent = '🔊 Read';
    readBtn.title = 'Read this text aloud';
    readBtn.style.marginLeft = '8px';
    el.appendChild(readBtn);

    readBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      let originalText = el.innerText.replace('✨ Simplify', '').replace('🔊 Read', '').trim();
      speakAloud(originalText);
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const now = Date.now();
      if (now - lastSimplifyTime < SIMPLIFY_COOLDOWN_MS) {
        const remaining = Math.ceil((SIMPLIFY_COOLDOWN_MS - (now - lastSimplifyTime)) / 1000);
        const oldText = btn.textContent;
        btn.textContent = `⏳ Wait ${remaining}s...`;
        setTimeout(() => { if (btn.textContent.includes('Wait')) btn.textContent = oldText; }, 2000);
        return;
      }

      const originalText = el.innerText.replace('✨ Simplify', '').replace('🔊 Read', '').trim();
      if (!originalText) return;

      const applySimplifiedDom = (simplifiedStr, origStr) => {
        btn.remove();
        readBtn.remove();
        el.dataset.originalText = origStr;
        el.dataset.simplifiedText = simplifiedStr;
        el.innerHTML = simplifiedStr.replace(/\n/g, '<br>');

        const restoreBtn = document.createElement('button');
        restoreBtn.className = 'accessai-simplify-btn accessai-restore-btn';
        restoreBtn.textContent = '↩ Restore';
        restoreBtn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          el.innerHTML = origStr;
          el.dataset.accessaiWrapped = '';
          initSimplifyButtons();
        });

        const newReadBtn = document.createElement('button');
        newReadBtn.className = 'accessai-simplify-btn';
        newReadBtn.textContent = '🔊 Read';
        newReadBtn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          speakAloud(simplifiedStr);
        });

        el.appendChild(newReadBtn);
        el.appendChild(restoreBtn);
        speakAloud('Text simplified.');
      };

      if (el.dataset.simplifiedText) {
        applySimplifiedDom(el.dataset.simplifiedText, originalText);
        return;
      }

      lastSimplifyTime = Date.now();
      btn.textContent = '⏳ Simplifying...';
      btn.disabled = true;

      try {
        const level = await new Promise(r => {
          chrome.storage.local.get(['simplifyLevel'], res => r(res.simplifyLevel || 'standard'));
        });

        const response = await fetch(`${PROXY_URL}/api/simplify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AccessAI-Key': PROXY_API_KEY
          },
          body: JSON.stringify({ text: originalText, level })
        });
        const data = await response.json();
        if (data.success) {
          applySimplifiedDom(data.simplified_text, originalText);
        } else {
          throw new Error(data.error || 'Failed');
        }
      } catch (err) {
        btn.textContent = '✨ Simplify';
        btn.disabled = false;
        console.error('AccessAI simplify error:', err);
      }
    });
  });
}

// Auto-activate simplify buttons (user can toggle via context menu later)
// We activate them on message
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'UPDATE_STYLES') {
    currentSettings = { ...currentSettings, ...message.settings };
    applyStyles(currentSettings);
    if (message.settings.formAssistant !== undefined) {
      if (message.settings.formAssistant) initFormAssistant();
      else removeFormAssistant();
    }
    if (message.settings.simplifyHelpers !== undefined) {
      if (message.settings.simplifyHelpers) initSimplifyButtons();
      else removeSimplifyButtons();
    }
  } else if (message.type === 'ENTER_READER_MODE') {
    enterReaderMode();
  } else if (message.type === 'READ_ALOUD') {
    speak(message.text, true);
  } else if (message.type === 'TOGGLE_SIMPLIFY_BUTTONS') {
    if (simplifyButtonsActive) removeSimplifyButtons();
    else initSimplifyButtons();
  }
});

function removeSimplifyButtons() {
  document.querySelectorAll('.accessai-simplify-btn, .accessai-restore-btn').forEach(b => b.remove());
  document.querySelectorAll('[data-accessai-wrapped]').forEach(el => {
    delete el.dataset.accessaiWrapped;
    el.style.position = '';
  });
  simplifyButtonsActive = false;
}

// ─── Reader Mode ─────────────────────────────────────────────────────────────
function enterReaderMode() {
  if (document.getElementById('accessai-reader-overlay')) return;
  speak('Entering reader mode.', true);
  const article = document.querySelector('article') || document.querySelector('main') || document.body;
  const content = article.cloneNode(true);
  content.querySelectorAll('script, style, iframe, nav, footer, header, aside, .ad, [class*="ad-"], [id*="sidebar"]').forEach(el => el.remove());

  const overlay = document.createElement('div');
  overlay.id = 'accessai-reader-overlay';
  overlay.innerHTML = `
    <div class="reader-container">
      <button class="close-reader" id="accessai-reader-close">✕ Close Reader</button>
      <div class="reader-content">${content.innerHTML}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const closeBtn = document.getElementById('accessai-reader-close');
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    document.body.style.overflow = '';
    speak('Exited reader mode.', true);
  });
}

// ─── Mutation Observer for Dynamic SPAs ──────────────────────────────────────
let _domObserver = null;
let _simplifyDebounce = null;

function observeDOM() {
  if (_domObserver) return;
  _domObserver = new MutationObserver((mutations) => {
    if (!simplifyButtonsActive) return;
    let shouldUpdate = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        shouldUpdate = true;
        break;
      }
    }
    if (shouldUpdate) {
      clearTimeout(_simplifyDebounce);
      _simplifyDebounce = setTimeout(() => {
        if (simplifyButtonsActive) {
          simplifyButtonsActive = false; // temporarily reset to bypass guard
          initSimplifyButtons();
        }
      }, 1200);
    }
  });
  _domObserver.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', observeDOM);
} else {
  observeDOM();
}
