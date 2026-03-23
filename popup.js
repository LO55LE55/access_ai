document.addEventListener('DOMContentLoaded', () => {
  const dyslexiaFont    = document.getElementById('dyslexiaFont');
  const formAssistant   = document.getElementById('formAssistant');
  const voiceFeedback   = document.getElementById('voiceFeedback');
  const fontSizeSlider  = document.getElementById('fontSizeSlider');
  const fontSizeDisplay = document.getElementById('fontSizeDisplay');
  const resetFontSize   = document.getElementById('resetFontSize');
  const enterReaderMode = document.getElementById('enterReaderMode');
  const highContrast    = document.getElementById('highContrast');
  const colorFilter     = document.getElementById('colorFilter');
  const simplifyHelpers = document.getElementById('simplifyHelpers');
  const simplifyLevel   = document.getElementById('simplifyLevel');

  const themeToggle     = document.getElementById('themeToggle');
  const themeIconDark   = document.getElementById('themeIconDark');
  const themeIconLight  = document.getElementById('themeIconLight');

  function applyTheme(isLight) {
    if (isLight) {
      document.body.classList.add('light-theme');
      themeIconDark.style.display = 'none';
      themeIconLight.style.display = 'block';
    } else {
      document.body.classList.remove('light-theme');
      themeIconDark.style.display = 'block';
      themeIconLight.style.display = 'none';
    }
  }

  themeToggle.addEventListener('click', () => {
    const isLight = !document.body.classList.contains('light-theme');
    applyTheme(isLight);
    chrome.storage.local.set({ lightMode: isLight });
  });

  function speak(text) {
    // Only send if voice feedback is on — checked via storage
    chrome.storage.local.get(['voiceFeedback'], (res) => {
      if (res.voiceFeedback) {
        chrome.runtime.sendMessage({ type: 'SPEAK', text, interrupt: true });
      }
    });
  }

  function sendMessageToContent(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, message);
    });
  }


  // Load saved settings
  chrome.storage.local.get(['highContrast', 'dyslexiaFont', 'colorFilter', 'fontSize', 'formAssistant', 'voiceFeedback', 'simplifyLevel', 'simplifyHelpers', 'lightMode'], (res) => {
    applyTheme(!!res.lightMode);

    dyslexiaFont.checked  = res.dyslexiaFont  || false;
    formAssistant.checked = res.formAssistant || false;
    simplifyHelpers.checked = res.simplifyHelpers || false;
    voiceFeedback.checked = res.voiceFeedback || false;
    highContrast.checked  = res.highContrast  || false;
    colorFilter.value     = res.colorFilter   || 'none';
    simplifyLevel.value   = res.simplifyLevel || 'standard';

    const fontSize = res.fontSize || 16;
    fontSizeSlider.value = fontSize;
    fontSizeDisplay.textContent = fontSize == 16 ? 'Default' : `${fontSize}pt`;
  });

  dyslexiaFont.addEventListener('change', () => {
    chrome.storage.local.set({ dyslexiaFont: dyslexiaFont.checked });
    sendMessageToContent({ type: 'UPDATE_STYLES', settings: { dyslexiaFont: dyslexiaFont.checked } });
    speak(dyslexiaFont.checked ? 'Dyslexia font enabled.' : 'Dyslexia font disabled.');
  });

  formAssistant.addEventListener('change', () => {
    chrome.storage.local.set({ formAssistant: formAssistant.checked });
    sendMessageToContent({ type: 'UPDATE_STYLES', settings: { formAssistant: formAssistant.checked } });
    speak(formAssistant.checked ? 'Form assistant enabled.' : 'Form assistant disabled.');
  });

  simplifyHelpers.addEventListener('change', () => {
    chrome.storage.local.set({ simplifyHelpers: simplifyHelpers.checked });
    sendMessageToContent({ type: 'UPDATE_STYLES', settings: { simplifyHelpers: simplifyHelpers.checked } });
    speak(simplifyHelpers.checked ? 'Content helpers enabled.' : 'Content helpers disabled.');
  });

  voiceFeedback.addEventListener('change', () => {
    chrome.storage.local.set({ voiceFeedback: voiceFeedback.checked });
    // Announce the change only if we're turning it ON
    if (voiceFeedback.checked) {
      chrome.runtime.sendMessage({ type: 'SPEAK', text: 'Voice feedback enabled.', interrupt: true });
    }
  });

  highContrast.addEventListener('change', () => {
    chrome.storage.local.set({ highContrast: highContrast.checked });
    sendMessageToContent({ type: 'UPDATE_STYLES', settings: { highContrast: highContrast.checked } });
    speak(highContrast.checked ? 'High contrast enabled.' : 'High contrast disabled.');
  });

  colorFilter.addEventListener('change', () => {
    chrome.storage.local.set({ colorFilter: colorFilter.value });
    sendMessageToContent({ type: 'UPDATE_STYLES', settings: { colorFilter: colorFilter.value } });
  });

  fontSizeSlider.addEventListener('input', () => {
    const size = fontSizeSlider.value;
    fontSizeDisplay.textContent = size == 16 ? 'Default' : `${size}pt`;
    chrome.storage.local.set({ fontSize: size });
    sendMessageToContent({ type: 'UPDATE_STYLES', settings: { fontSize: size } });
  });

  resetFontSize.addEventListener('click', () => {
    fontSizeSlider.value = 16;
    fontSizeDisplay.textContent = 'Default';
    chrome.storage.local.set({ fontSize: 16 });
    sendMessageToContent({ type: 'UPDATE_STYLES', settings: { fontSize: 16 } });
    speak('Font size reset to default.');
  });

  enterReaderMode.addEventListener('click', () => {
    sendMessageToContent({ type: 'ENTER_READER_MODE' });
    window.close();
  });

  simplifyLevel.addEventListener('change', () => {
    chrome.storage.local.set({ simplifyLevel: simplifyLevel.value });
  });
});
