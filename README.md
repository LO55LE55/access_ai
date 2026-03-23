# AccessAI: Universal Web Accessibility Suite

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Chrome: Extension](https://img.shields.io/badge/Chrome-Extension-4285F4.svg)
![Built with: Gemini](https://img.shields.io/badge/AI-Gemini-orange.svg)
![Proxy: HuggingFace](https://img.shields.io/badge/Space-HuggingFace-FFD21E.svg)

**AccessAI** is an all-in-one Chrome extension designed to dismantle digital barriers. From AI-powered text simplification and smart voice-to-form dictation to reading modes and dyslexia-specific typography, AccessAI empowers users of all abilities to navigate the modern web with confidence.

---

## 🚀 Key Features

### 🧠 AI & Cognitive Support
- **AI Text Simplification**: Leverages Gemma 3 (via Hugging Face) to instantly simplify complex jargon into easy-to-read language.
- **Support Levels**: Choose from "Simple", "Standard", or "Detailed" based on your needs.
- **OpenDyslexic Support**: One-click toggle for specialized typography designed to improve reading speed and accuracy for dyslexic users.

### 🔊 Advanced Audio & Voice
- **Universal Form Assistant**: Intelligent voice-input for any text field, select dropdown, or radio group.
- **Local Transcription**: Uses `faster-whisper` running locally on your private proxy server—no external STT APIs or quotas required.
- **NLP Email Parsing**: Intelligent dictation formatting—automatically converts spoken "at" into "@" symbols and handles digit sequences.
- **TTS Queue Manager**: High-precision text-to-speech with audio confirmations for every UI action.

### 👁️ Visual & Layout Customization
- **Color Filters**: Built-in overlays for Protanopia, Deuteranopia, and Tritanopia.
- **Reader Mode**: Distraction-free reading by stripping away ads, popups, and non-essential layout elements.
- **Dynamic Font Scaling**: Real-time page-wide font scaling that respects site architecture.

---

## 📁 Project Structure

```text
├── manifest.json         # Extension configuration
├── assets/               # Brand icons and visual assets
├── background.js         # Service worker for TTS, logic, and context menus
├── content.js            # Core UI injection, simplifies, and page logic
├── popup.html            # Primary settings dashboard
├── sidePanel.js          # Logic for side panel analysis and image OCR
├── opendyslexic-0.92/    # Integrated accessibility font files
└── proxy/                # Python backend (Hugging Face Space)
    ├── app.py            # Flask API for STT and LLM logic
    └── gemini_service.py # Integration with Gemini 2.0 and Gemma 3
```

---

## 🛠️ Getting Started

This project consists of two parts: **The Chrome Extension** (Client) and **The Private Proxy** (Server running on Hugging Face).

### Prerequisites
1. A Google Gemini API Key.
2. A Hugging Face Account and Access Token (`HF_TOKEN`).

### Setup the Proxy
1. Create a new "Docker" Space on [Hugging Face](https://huggingface.co/new-space).
2. Upload the contents of the `/proxy` folder.
3. Add your `GEMINI_API_KEY`, `HF_TOKEN`, and `PROXY_API_KEY` (custom password) to the Space Secrets.

### Install the Extension
1. Update `PROXY_URL` and `PROXY_API_KEY` in `content.js` and `sidePanel.js`.
2. Open `chrome://extensions/` in Chrome.
3. Enable "Developer mode" and click "Load unpacked".
4. Select the project folder.

---

## 🔒 Security & Privacy
- **EndPoint Protection**: All incoming proxy requests are authenticated via a custom `X-AccessAI-Key` header.
- **Local Audio Privacy**: Transcription is performed locally on your private server using Whisper—no third-party cloud audio recording.

## 📜 License
Distributable under the [MIT License](LICENSE).
