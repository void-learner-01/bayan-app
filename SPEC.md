# Bayan (بیان) — Product Specification (SPEC.md)

**Bayan** is a lightweight, zero-install, privacy-first web application designed specifically for deaf and hard-of-hearing students attending physical classroom lectures. It provides live, high-contrast, bilingual (Urdu & English) speech-to-text captions directly on a desk-placed laptop or mobile device.

---

## 1. Target User & Classroom Context

- **User:** Deaf and hard-of-hearing students in physical school, college, or university classrooms.
- **Physical Setup:** Student places their laptop or smartphone on the classroom desk. The device's built-in microphone captures the teacher's voice from a typical classroom distance.
- **Platform:** Web application (Next.js App Router, TypeScript, Tailwind CSS) running in modern mobile and desktop browsers (Chrome, Edge, Safari). No app store downloads or installations required.

---

## 2. Architecture & Technical Pipeline

```
[ Classroom Teacher Speech ]
             │
             ▼
[ Device Built-in Microphone ]
             │
             ▼
[ Browser Web Audio API & MediaRecorder ]
     ├── 1. Live Mic Volume Meter (Visual sound indicator)
     ├── 2. Silence / VAD Gate (RMS volume threshold)
     └── 3. Discrete 3-4s Audio Chunking (Stop & Restart cycle for valid file headers)
             │
             ├─ (Voice Detected & Online) ─────► POST /api/transcribe (Standalone Audio Blob)
             │                                         │
             │                                         ▼
             │                                [ Google Gemini API ] (Server-side)
             │                                         │
             │                                         ▼
             │                                [ Transcript Text JSON ]
             │                                         │
             │◄────────────────────────────────────────┘
             │
             ├─ (Gemini Error / Quota Limit) ──► [ Browser Web Speech API Fallback ]
             │
             └─ (No Internet / Disconnected) ──► [ Offline Notice Banner (Transcription Paused) ]
                                                       │
                                                       ▼
                                            [ High-Contrast Captions UI ]
                                            - Privacy notice: "Awaz transcription ke liye Google ko bheji jati hai, save nahi hoti."
                                            - Noto Nastaliq Urdu (RTL) / Sans (LTR)
                                            - Font Size Controls & Scroll Lock
                                            - LocalStorage Persistence
```

---

## 3. Features & Acceptance Criteria

### F1: Real-Time Audio Capture & Live Mic Volume Meter
- **Description:** Capture microphone input via `navigator.mediaDevices.getUserMedia` and provide real-time visual feedback of audio volume.
- **Done when:**
  - [ ] App prompts for microphone permission on first "Start" click with friendly guidance.
  - [ ] A visible, dynamic volume meter/waveform bar animates continuously based on the incoming mic volume level.
  - [ ] The deaf student can immediately see whether sound is being detected by the microphone, even in quiet or noisy environments.

### F2: Discrete Chunking (Stop/Restart) & Silence VAD Gate
- **Description:** Run `MediaRecorder` in discrete 3 to 4-second cycles by stopping and restarting the recorder so that each recorded chunk forms a complete, standalone audio file with valid container headers (e.g. `audio/webm;codecs=opus`). Measure audio volume (RMS) via Web Audio API to detect silence.
- **Done when:**
  - [ ] `MediaRecorder` cycles every 3-4 seconds: it stops (`.stop()`), emits `ondataavailable` with a complete standalone audio blob, and immediately restarts (`.start()`).
  - [ ] If average audio volume during an interval falls below the silence threshold, the audio chunk is discarded and no HTTP request is made.
  - [ ] Audio transmission automatically resumes as soon as speech volume exceeds the threshold.

### F3: Server-Side Gemini API Transcription Route
- **Description:** A Next.js API route (`/api/transcribe`) that receives complete audio chunks (`audio/webm` or `audio/wav`), invokes the Google Gemini API with a bilingual transcription prompt, and returns the transcribed text.
- **Done when:**
  - [ ] The Gemini API key is loaded strictly from `.env.local` on the server and is never exposed in client bundles or public repositories.
  - [ ] Endpoint successfully parses the standalone audio file and returns clean transcript text (handling Urdu, English, and code-mixed speech).
  - [ ] Gracefully handles errors (e.g., invalid key, rate limits, quota issues) by returning a structured error response to trigger client fallback.

### F4: Browser Web Speech API Fallback & Offline Notice
- **Description:** Fallback to browser-native `SpeechRecognition` / `webkitSpeechRecognition` ONLY when the Gemini API encounters an error or quota exhaustion while internet is active. If internet is completely disconnected, do NOT invoke browser fallback (since browser speech recognition also requires internet connectivity); instead, display a clear offline banner.
- **Done when:**
  - [ ] When Gemini returns an error or quota exhaustion while online, app automatically switches to browser Web Speech API.
  - [ ] Status badge in the UI updates to reflect the active mode:
    - **"Cloud"** badge when Gemini API is transcribing.
    - **"Browser Fallback"** badge when operating via browser-native STT due to API error/quota.
  - [ ] If internet is completely lost (`navigator.onLine === false` or network failure), app displays a prominent **"Offline — Internet disconnected, transcription paused"** banner and halts requests.
  - [ ] When internet/cloud service recovers, app cleanly resumes normal Cloud operation.

### F5: High-Contrast Dark Mode & Accessible Reading Controls
- **Description:** Visual design optimized for reading endurance and low eye-strain for deaf students.
- **Done when:**
  - [ ] Default display is pitch-black / deep dark background with high-contrast text (crisp white `#FFFFFF` and vibrant yellow `#FFE600` accents).
  - [ ] Prominent `+` (Zoom In) and `-` (Zoom Out) buttons allow quick font size adjustments directly from the caption screen without opening menus.
  - [ ] Text remains readable and sharp across mobile screens and large laptop displays.

### F6: Bilingual Auto-Detection & Urdu Typography
- **Description:** Automatic detection of Urdu script within each sentence block to dynamically apply proper font family and text orientation.
- **Done when:**
  - [ ] Sentences containing Arabic/Urdu unicode range (`[\u0600-\u06FF]`) are styled with `Noto Nastaliq Urdu` font and `dir="rtl"` (right-to-left alignment).
  - [ ] Pure English sentences default to clean sans-serif typography with `dir="ltr"` (left-to-right alignment).
  - [ ] Mixed sentences render cleanly without overlapping or broken glyphs.

### F7: Sentence-by-Sentence Stream & Auto-Scroll Pause
- **Description:** Displays captions as progressive, sentence-by-sentence blocks. New sentences appear at the bottom.
- **Done when:**
  - [ ] Live text appends as clean, distinct sentence blocks at the bottom of the feed.
  - [ ] Feed automatically scrolls down as new sentences arrive by default.
  - [ ] A sticky "Pause Scroll" / "Resume Scroll" toggle allows the student to freeze scrolling to read previous sentences without interruption while the app continues transcribing in the background.
  - [ ] A visual indicator shows when new unread sentences have arrived while scroll is paused.

### F8: Session Management & LocalStorage Persistence
- **Description:** Frictionless guest-mode session that automatically preserves lecture notes across browser refreshes.
- **Done when:**
  - [x] Student can open the app and start transcribing immediately with zero login or signup requirements.
  - [x] Current lecture transcript is continuously synced to browser `localStorage`.
  - [x] If the student accidentally refreshes or closes the browser tab, the full transcript reloads intact upon return.
  - [x] A "Clear / New Lecture" button allows wiping the current transcript (with a simple confirmation dialog to avoid accidental loss).

### F9: Export & Note-Taking Tools
- **Description:** Easy one-click tools for the student to save or copy the lecture text after class.
- **Done when:**
  - [x] **"Copy All Text"** button copies the entire lecture transcript to the system clipboard with clear visual confirmation (e.g., "Copied!").
  - [x] **"Download (.txt)"** button downloads a formatted plain text file named with the current date/time (e.g., `Bayan-Lecture-2026-10-15.txt`).

---

## 4. Privacy & Data Protection

1. **Third-Party Processing Disclosure:** Audio captured by the microphone is transmitted over HTTPS to the server route and forwarded to Google Gemini API solely for the purpose of speech-to-text transcription.
2. **Mandatory In-App Privacy Notice:** The application UI must display a clear, persistent notice for the student:
   > *"Awaz transcription ke liye Google ko bheji jati hai, save nahi hoti."*  
   > *(English: "Audio is sent to Google for transcription only; it is never saved.")*
3. **Zero Server Audio Storage:** Audio chunks uploaded to `/api/transcribe` exist strictly in ephemeral memory during the transcription request lifecycle. They are **never saved to server disk, database, or persistent storage**, and raw audio is never logged.
4. **Zero Central Database:** Transcripts are stored exclusively on the student's personal device in browser `localStorage`.
5. **No Tracking or Accounts:** No personal student information, emails, or behavioral telemetry are collected.

---

## 5. Out of Scope (MVP)

The following items are intentionally excluded from the initial release:
- User authentication, signups, passwords, and user profiles.
- External databases (PostgreSQL, Supabase, Firebase, MongoDB).
- Audio loopback / integrations for Zoom, Google Meet, or Microsoft Teams (physical classroom only).
- Saving, archiving, or replaying raw audio files.
- Per-sentence timestamps or audio-to-text alignment scrubbing.
- AI lecture summarization, mind-maps, or quiz generation.
