# Bayan — Development Guidelines (CLAUDE.md)

## Tech Stack
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (High-contrast dark mode palette)
- **Primary STT:** Google Gemini API (Server-side route: `/api/transcribe`)
- **Fallback STT:** Browser-native Web Speech API (`webkitSpeechRecognition`) — used *only* on Gemini API error/quota limits when online. If offline, display offline banner.

---

## Non-Negotiable Core Rules

1. **Ek Waqt Mein Ek Feature & Strict Verification:**
   - Hamesha ek waqt mein sirf ek feature (F1, F2, F3...) implement karo.
   - Har feature complete karne ke baad:
     - `npm run build` aur `npm run lint` chalao.
     - Terminal ka output/result wazeh tor par dikhao.
     - SPEC.md ka "Done when" checklist verify karo.
   - Jab build aur lint 100% clean pass hon, **tab hi feature ko "Done" kaho** aur agle feature par barho.

2. **Security & API Keys:**
   - Gemini API key sirf aur sirf server-side route (`app/api/transcribe/route.ts`) ke andar call hogi.
   - Key hamesha `.env.local` mein rahegi (`GEMINI_API_KEY`).
   - Browser client bundle ya git repository mein API key **kabhi** expose nahi karni.

3. **Audio Chunking Architecture:**
   - Har 3–4 second par `MediaRecorder` ko `.stop()` karke foran `.start()` karo taake har chunk ek mukammal standalone audio file bane (complete container headers ke sath).
   - Silence threshold (VAD) check karo taake silent chunks par API call na jaye.

4. **Privacy & In-App Notice:**
   - Audio chunks sirf ephemeral server memory mein process honge; server disk par koi audio save ya log nahi karni.
   - UI mein wazeh notice display hona lazmi hai:
     > *"Awaz transcription ke liye Google ko bheji jati hai, save nahi hoti."*
   - Koi database nahi; student ke lecture notes sirf browser ke `localStorage` mein rahenge.

5. **Accessibility & Urdu Typography:**
   - High-contrast dark theme (pitch-black background `#000000`, white `#FFFFFF` / high-contrast yellow `#FFE600` text).
   - Jis sentence block mein Arabic/Urdu unicode script ho (`[\u0600-\u06FF]`), us par `dir="rtl"` aur `Noto Nastaliq Urdu` font apply karo. English ke liye `dir="ltr"` aur sans-serif.

---

## Verification Commands
```bash
npm run dev    # Local development server
npm run build  # Production build verification (must pass after every feature)
npm run lint   # ESLint checks (must pass after every feature)
```
