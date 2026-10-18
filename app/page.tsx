"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useAudioChunker, ChunkInfo } from "@/hooks/useAudioChunker";
import { useWebSpeech, SupportedLanguage } from "@/hooks/useWebSpeech";
import { VolumeMeter } from "@/components/VolumeMeter";

export default function Home() {
  // Engine & Language preferences
  const [useGemini, setUseGemini] = useState<boolean>(false); // Default OFF per user instruction
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>("ur-PK"); // Default اردو

  // Gemini Chunker State
  const [lastEmittedChunk, setLastEmittedChunk] = useState<{
    size: number;
    mimeType: string;
    timestamp: number;
  } | null>(null);
  const [geminiTranscript, setGeminiTranscript] = useState<string>("");
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [geminiTranscriptCount, setGeminiTranscriptCount] = useState<number>(0);

  // Web Speech Hook (Browser-native, primary engine)
  const {
    isSupported: isWebSpeechSupported,
    isListening: isWebSpeechListening,
    finalTranscript,
    interimTranscript,
    speechError: webSpeechError,
    startListening: startWebSpeech,
    stopListening: stopWebSpeech,
    changeLanguage,
    clearTranscript: clearWebSpeechTranscript,
  } = useWebSpeech({
    lang: selectedLanguage,
  });

  // F1: Microphone capture & real-time RMS volume analysis
  const {
    isCapturing,
    volume,
    isSoundDetected,
    permissionStatus,
    errorMessage,
    startCapture,
    stopCapture,
    stream,
  } = useAudioCapture(8);

  // Ref to track latest useGemini in async chunker callback
  const useGeminiRef = useRef<boolean>(useGemini);
  useEffect(() => {
    useGeminiRef.current = useGemini;
  }, [useGemini]);

  // F2: Discrete 3.5s cycle chunking (active when Gemini mode is selected)
  const {
    chunkStatus,
    totalCycles,
    speechChunksCount,
    discardedChunksCount,
    lastChunkInfo,
    activeMimeType,
  } = useAudioChunker({
    stream,
    isCapturing: isCapturing && useGemini, // Only chunk audio when Gemini mode is ON
    volume,
    isSoundDetected,
    chunkDurationMs: 3500,
    silenceThreshold: 8,
    onChunkReady: async (blob: Blob, info: ChunkInfo) => {
      if (!useGeminiRef.current) return;

      setLastEmittedChunk({
        size: info.size,
        mimeType: info.mimeType,
        timestamp: info.timestamp,
      });

      // Dispatch chunk to server route /api/transcribe
      const formData = new FormData();
      formData.append("audio", blob, "chunk.webm");

      setIsTranscribing(true);
      setTranscribeError(null);

      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}: Transcription failed`);
        }

        const text = (data.text || "").trim();
        setGeminiTranscript((prev) => {
          const fresh = text || "(No speech detected / Silence)";
          return prev ? `${prev} ${fresh}` : fresh;
        });
        setGeminiTranscriptCount((prev) => prev + 1);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network/API error";
        setTranscribeError(msg);
      } finally {
        setIsTranscribing(false);
      }
    },
  });

  // Handle Start / Stop Microphone
  const handleToggleMic = async () => {
    if (!isCapturing) {
      await startCapture();
      if (!useGemini) {
        startWebSpeech();
      }
    } else {
      stopCapture();
      stopWebSpeech();
    }
  };

  // Handle Language Switch (Hot-swap without mic stop)
  const handleLanguageChange = (newLang: SupportedLanguage) => {
    setSelectedLanguage(newLang);
    changeLanguage(newLang);
  };

  // Handle Engine Switch (Web Speech vs Gemini)
  const handleEngineToggle = (nextUseGemini: boolean) => {
    setUseGemini(nextUseGemini);
    if (isCapturing) {
      if (nextUseGemini) {
        // Switching to Gemini: stop browser speech recognition
        stopWebSpeech();
      } else {
        // Switching back to Web Speech: start browser recognition
        startWebSpeech();
      }
    }
  };

  const clearAllCaptions = () => {
    clearWebSpeechTranscript();
    setGeminiTranscript("");
    setTranscribeError(null);
  };

  // Determine text direction for display
  const isUrduLanguage = selectedLanguage === "ur-PK";
  const displayedText = useGemini ? geminiTranscript : finalTranscript;
  const hasText = Boolean(displayedText || (!useGemini && interimTranscript));

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between selection:bg-[#FFE600] selection:text-black">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-black/80 backdrop-blur px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#FFE600] flex items-center justify-center text-black font-extrabold text-xl shadow-[0_0_15px_rgba(255,230,0,0.3)]">
              ب
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white">
                  Bayan
                </h1>
                <span className="text-zinc-400 font-semibold text-sm">
                  (بیان)
                </span>
              </div>
              <p className="text-xs text-zinc-400">Classroom Live Captions</p>
            </div>
          </div>

          {/* Header Controls: Language Selector & Mic Status */}
          <div className="flex items-center gap-3">
            {/* Language Selector (Hot-swap without stopping mic) */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => handleLanguageChange("ur-PK")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedLanguage === "ur-PK"
                    ? "bg-[#FFE600] text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                اردو
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange("en-US")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedLanguage === "en-US"
                    ? "bg-[#FFE600] text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                English
              </button>
            </div>

            {/* Mic Status Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                isCapturing
                  ? "bg-[#FFE600]/15 text-[#FFE600] border-[#FFE600]/30"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isCapturing ? "bg-[#FFE600] animate-pulse" : "bg-zinc-600"
                }`}
              />
              {isCapturing ? "Mic Active" : "Mic Standby"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Classroom Audio & Captions Hub */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 flex flex-col justify-center gap-6">
        {/* Browser Support Warning (Chrome/Edge recommended) */}
        {!isWebSpeechSupported && !useGemini && (
          <div className="w-full bg-amber-950/50 border-2 border-amber-600/70 rounded-2xl p-4 sm:p-5 text-amber-200">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">
                  Browser Support Warning (Web Speech API)
                </h3>
                <p className="text-sm text-amber-200/90 leading-relaxed">
                  Aapka browser live Web Speech recognition support nahi karta. Live streaming captions ke liye barah-e-karam{" "}
                  <strong className="text-white underline">Google Chrome</strong> ya{" "}
                  <strong className="text-white underline">Microsoft Edge</strong> istemal karein, ya neeche diye gaye switch se{" "}
                  <strong className="text-[#FFE600]">Gemini AI Mode</strong> on karein.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Primary Controls & Engine Switcher */}
        <div className="flex flex-col items-center gap-4">
          {/* Start / Stop Button */}
          {!isCapturing ? (
            <button
              onClick={() => void handleToggleMic()}
              className="group relative flex items-center justify-center gap-3 px-8 py-4 bg-[#FFE600] hover:bg-[#ffe81a] active:scale-95 text-black font-bold text-lg rounded-2xl shadow-[0_0_25px_rgba(255,230,0,0.25)] transition-all cursor-pointer"
            >
              <svg
                className="w-6 h-6 fill-current"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
              <span>Start Microphone</span>
            </button>
          ) : (
            <button
              onClick={() => void handleToggleMic()}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white font-bold text-lg rounded-2xl border border-zinc-700 shadow-lg transition-all cursor-pointer"
            >
              <svg
                className="w-6 h-6 fill-current text-red-400"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M6 6h12v12H6z" />
              </svg>
              <span>Stop Microphone</span>
            </button>
          )}

          {/* Engine Mode Switch (Web Speech [Default] vs Gemini AI) */}
          <div className="flex flex-col items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-3 sm:px-5">
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-semibold ${
                  !useGemini ? "text-[#FFE600]" : "text-zinc-500"
                }`}
              >
                Browser Web Speech (Free / Live Stream)
              </span>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={useGemini}
                onClick={() => handleEngineToggle(!useGemini)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  useGemini ? "bg-[#FFE600]" : "bg-zinc-800"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-black transition-transform ${
                    useGemini ? "translate-x-6 bg-black" : "translate-x-1 bg-white"
                  }`}
                />
              </button>

              <span
                className={`text-xs font-semibold ${
                  useGemini ? "text-[#FFE600]" : "text-zinc-500"
                }`}
              >
                Gemini AI Mode (Optional)
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 text-center">
              {useGemini
                ? "⚡ Gemini 3.8 Flash active (Chunked 3.5s — 5 req/min free limit)"
                : "⚡ Browser Web Speech active (Unlimited, zero-latency live typing)"}
            </p>
          </div>

          {/* Mic Permission Guidance Messages */}
          {permissionStatus === "idle" && (
            <p className="text-xs text-zinc-400 text-center max-w-sm">
              Press &quot;Start Microphone&quot; to begin. Browser will ask for microphone access.
            </p>
          )}

          {permissionStatus === "requesting" && (
            <div className="flex items-center gap-2 text-sm text-[#FFE600] bg-[#FFE600]/10 border border-[#FFE600]/30 px-4 py-2 rounded-xl">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              <span>Waiting for microphone permission in your browser...</span>
            </div>
          )}

          {permissionStatus === "denied" && errorMessage && (
            <div className="w-full max-w-md bg-red-950/40 border border-red-800/80 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-red-300 mb-1">
                Microphone Permission Blocked
              </p>
              <p className="text-xs text-red-200">{errorMessage}</p>
            </div>
          )}

          {webSpeechError && !useGemini && (
            <div className="w-full max-w-md bg-red-950/40 border border-red-800/80 rounded-xl p-3 text-center">
              <p className="text-xs text-red-300 font-mono">{webSpeechError}</p>
            </div>
          )}
        </div>

        {/* Live Volume Meter Component */}
        <div className="w-full max-w-2xl mx-auto">
          <VolumeMeter
            volume={volume}
            isCapturing={isCapturing}
            isSoundDetected={isSoundDetected}
          />
        </div>

        {/* Live Captions Display Card (Primary Experience for Deaf Students) */}
        <div className="w-full max-w-2xl mx-auto rounded-3xl border-2 border-zinc-800 bg-zinc-950 p-5 sm:p-7 shadow-2xl space-y-4">
          {/* Card Header */}
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FFE600] animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Live Classroom Captions
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                {selectedLanguage === "ur-PK" ? "اردو (ur-PK)" : "English (en-US)"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  !useGemini
                    ? isWebSpeechListening
                      ? "bg-emerald-950/80 text-emerald-300 border-emerald-700/60"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                    : isTranscribing
                    ? "bg-[#FFE600]/15 text-[#FFE600] border-[#FFE600]/30 animate-pulse"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800"
                }`}
              >
                {!useGemini
                  ? isWebSpeechListening
                    ? "Web Speech Streaming"
                    : "Web Speech Standby"
                  : isTranscribing
                  ? "Gemini Processing..."
                  : `Gemini Chunks (${geminiTranscriptCount})`}
              </span>

              {hasText && (
                <button
                  type="button"
                  onClick={clearAllCaptions}
                  className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded border border-zinc-800 hover:border-zinc-600 transition-colors cursor-pointer"
                  title="Clear Captions"
                >
                  Clear / صاف کریں
                </button>
              )}
            </div>
          </div>

          {/* Captions Text Presentation Area */}
          <div className="min-h-[140px] rounded-2xl bg-black border border-zinc-800/90 p-5 sm:p-6 flex flex-col justify-center">
            {transcribeError && useGemini ? (
              <div className="space-y-1">
                <p className="text-xs text-red-400 font-bold uppercase tracking-wider">
                  Transcription Error
                </p>
                <p className="text-sm text-red-300 font-mono break-words">
                  {transcribeError}
                </p>
              </div>
            ) : hasText ? (
              <div
                dir={isUrduLanguage ? "rtl" : "ltr"}
                className={`text-xl sm:text-2xl font-medium leading-relaxed ${
                  isUrduLanguage ? "text-right font-serif" : "text-left"
                }`}
              >
                {/* Finalized text (Solid, high-contrast, permanent) */}
                <span className="text-white font-medium">
                  {displayedText}
                </span>

                {/* Interim text in Web Speech mode (lighter, dimmed, indicating live in-flight words) */}
                {!useGemini && interimTranscript && (
                  <span className="text-zinc-400 font-normal italic opacity-75 inline-block mr-2 ml-2 transition-opacity">
                    {interimTranscript}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-sm sm:text-base text-zinc-500 italic text-center leading-relaxed">
                {!isCapturing
                  ? "Microphone on karein aur bolna shuru karein. Alfaz foran screen par aana shuru ho jayenge."
                  : "Awaz suni ja rahi hai... bolte hi live captions yahan dikhenge."}
              </p>
            )}
          </div>

          {/* Engine & Diagnostics Footer Bar */}
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1">
            <span>
              Engine:{" "}
              {useGemini ? (
                <strong className="text-zinc-200">Gemini 3.8 Flash (Server Chunker)</strong>
              ) : (
                <strong className="text-[#FFE600]">Browser Web Speech API (Client-side)</strong>
              )}
            </span>
            <span>
              {useGemini
                ? `Route: POST /api/transcribe`
                : `Engine Lang: ${selectedLanguage}`}
            </span>
          </div>
        </div>

        {/* Gemini Chunker Diagnostics (Visible if Gemini Mode is ON) */}
        {useGemini && (
          <div className="w-full max-w-2xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-xs font-bold text-zinc-300">
                Gemini Chunker VAD Monitor (3.5s cycles)
              </span>
              <span className="text-xs font-mono text-zinc-400">
                Status: {chunkStatus}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                <span className="text-zinc-400">Total:</span>{" "}
                <strong className="text-white font-mono">{totalCycles}</strong>
              </div>
              <div className="bg-zinc-900 border border-emerald-900/40 rounded-lg p-2">
                <span className="text-emerald-400">Speech Chunks:</span>{" "}
                <strong className="text-emerald-400 font-mono">{speechChunksCount}</strong>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2">
                <span className="text-zinc-400">Dropped Silent:</span>{" "}
                <strong className="text-zinc-400 font-mono">{discardedChunksCount}</strong>
              </div>
            </div>

            {lastChunkInfo && (
              <div className="text-[11px] text-zinc-400 font-mono flex justify-between">
                <span>Last Chunk: {(lastChunkInfo.size / 1024).toFixed(1)} KB ({lastChunkInfo.avgVolume}% RMS)</span>
                <span>Type: {activeMimeType || "audio/webm"}</span>
              </div>
            )}
            {lastEmittedChunk && (
              <div className="text-[11px] text-emerald-400 font-mono flex justify-between">
                <span>Dispatched to API: {(lastEmittedChunk.size / 1024).toFixed(1)} KB</span>
                <span>Timestamp: {new Date(lastEmittedChunk.timestamp).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer with Comprehensive Privacy Notice */}
      <footer className="border-t border-zinc-900 bg-black px-4 py-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-2">
          {/* Privacy Notice Required by Guidelines */}
          <div className="inline-block bg-zinc-900/90 border border-zinc-800 px-4 py-2.5 rounded-xl">
            <p className="text-xs sm:text-sm text-zinc-300 font-medium">
              🔒 <span className="text-[#FFE600]">Awaz live transcription ke liye browser (Google Web Speech) ya Gemini API ko bheji jati hai, kahin save nahi hoti.</span>
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Audio is processed in real time for assistive classroom captions only. No audio is ever stored on disk or recorded.
            </p>
          </div>
          <p className="text-[11px] text-zinc-400">
            Bayan (بیان) — Zero-install assistive lecture tool for physical classrooms.
          </p>
        </div>
      </footer>
    </div>
  );
}
