"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, useSyncExternalStore, startTransition } from "react";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { useAudioChunker, ChunkInfo } from "@/hooks/useAudioChunker";
import { useWebSpeech, SupportedLanguage } from "@/hooks/useWebSpeech";
import { VolumeMeter } from "@/components/VolumeMeter";
import { BilingualCaption, splitIntoSentences } from "@/components/BilingualCaption";
import { OfflineBanner } from "@/components/OfflineBanner";
import { StatusBadge, ModeBadgeType } from "@/components/StatusBadge";

type FontSizeScale = "md" | "lg" | "xl" | "2xl";

const FONT_SIZE_CLASSES: Record<FontSizeScale, string> = {
  md: "text-lg sm:text-xl",
  lg: "text-xl sm:text-2xl",
  xl: "text-2xl sm:text-3xl",
  "2xl": "text-3xl sm:text-4xl",
};

export default function Home() {
  // Online / Offline status via useSyncExternalStore (SPEC F4)
  const isOnline = useSyncExternalStore(
    (callback) => {
      window.addEventListener("online", callback);
      window.addEventListener("offline", callback);
      return () => {
        window.removeEventListener("online", callback);
        window.removeEventListener("offline", callback);
      };
    },
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
    () => true
  );

  // Engine preference (Cloud Gemini is primary per SPEC.md, defaults to true)
  const [useGemini, setUseGemini] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("bayan_engine_mode");
      return saved === null ? true : saved === "gemini";
    } catch {
      return true;
    }
  });

  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(() => {
    if (typeof window === "undefined") return "ur-PK";
    try {
      const saved = localStorage.getItem("bayan_language");
      return saved === "en-US" ? "en-US" : "ur-PK";
    } catch {
      return "ur-PK";
    }
  });

  // SPEC F4: Fallback state when Gemini encounters error/quota while online
  const [isFallbackActive, setIsFallbackActive] = useState<boolean>(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  // Unified lecture transcript state (SPEC F4, F8)
  const [lectureTranscript, setLectureTranscript] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("bayan_lecture_transcript") || "";
    } catch {
      return "";
    }
  });

  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [geminiTranscriptCount, setGeminiTranscriptCount] = useState<number>(0);
  const [lastEmittedChunk, setLastEmittedChunk] = useState<{
    size: number;
    mimeType: string;
    timestamp: number;
  } | null>(null);

  // Web Speech Hook (Browser-native fallback / manual engine)
  const {
    isSupported: isWebSpeechSupported,
    isListening: isWebSpeechListening,
    interimTranscript,
    speechError: webSpeechError,
    startListening: startWebSpeech,
    stopListening: stopWebSpeech,
    changeLanguage,
    clearTranscript: clearWebSpeechTranscript,
  } = useWebSpeech({
    lang: selectedLanguage,
    onFinalPart: (newChunk: string) => {
      if (newChunk) {
        setLectureTranscript((prev) => (prev ? `${prev}\n${newChunk}` : newChunk));
      }
    },
  });

  // F1: Microphone capture & volume meter
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

  // F5: Accessible Font Size Zoom Controls
  const [fontSize, setFontSize] = useState<FontSizeScale>(() => {
    if (typeof window === "undefined") return "lg";
    try {
      const saved = localStorage.getItem("bayan_font_size");
      if (saved && ["md", "lg", "xl", "2xl"].includes(saved)) {
        return saved as FontSizeScale;
      }
      return "lg";
    } catch {
      return "lg";
    }
  });

  const zoomIn = () => {
    setFontSize((prev) => {
      if (prev === "md") return "lg";
      if (prev === "lg") return "xl";
      if (prev === "xl") return "2xl";
      return prev;
    });
  };
  const zoomOut = () => {
    setFontSize((prev) => {
      if (prev === "2xl") return "xl";
      if (prev === "xl") return "lg";
      if (prev === "lg") return "md";
      return prev;
    });
  };
  const resetZoom = () => setFontSize("lg");

  // F7: Auto-scroll & Scroll Pause
  const captionsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrollPaused, setIsScrollPaused] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Save to localStorage continuously (F8)
  useEffect(() => {
    try {
      if (lectureTranscript) {
        localStorage.setItem("bayan_lecture_transcript", lectureTranscript);
      }
      localStorage.setItem("bayan_engine_mode", useGemini ? "gemini" : "webspeech");
      localStorage.setItem("bayan_language", selectedLanguage);
      localStorage.setItem("bayan_font_size", fontSize);
    } catch {
      // Ignore localStorage write error
    }
  }, [lectureTranscript, useGemini, selectedLanguage, fontSize]);

  // Ref for useGemini & isFallbackActive in async callbacks
  const useGeminiRef = useRef<boolean>(useGemini);
  useEffect(() => {
    useGeminiRef.current = useGemini;
  }, [useGemini]);

  const isFallbackActiveRef = useRef<boolean>(isFallbackActive);
  useEffect(() => {
    isFallbackActiveRef.current = isFallbackActive;
  }, [isFallbackActive]);

  // SPEC F4: Monitor online/offline transitions & clean recovery
  useEffect(() => {
    if (!isOnline) {
      // Disconnected: immediately halt browser speech recognition to prevent network loops
      stopWebSpeech();
    } else {
      // Reconnected: cleanly resume normal Cloud operation if user is capturing with Gemini
      if (isCapturing && useGemini) {
        startTransition(() => {
          setIsFallbackActive(false);
          setFallbackReason(null);
          setTranscribeError(null);
        });
        stopWebSpeech();
      }
    }
  }, [isOnline, isCapturing, useGemini, stopWebSpeech]);

  // F2 & F3: Audio Chunking & Gemini API Call (Paused when offline or fallback active)
  const {
    chunkStatus,
    totalCycles,
    speechChunksCount,
    discardedChunksCount,
    lastChunkInfo,
    activeMimeType,
  } = useAudioChunker({
    stream,
    isCapturing: isCapturing && useGemini && isOnline && !isFallbackActive,
    volume,
    isSoundDetected,
    chunkDurationMs: 3500,
    silenceThreshold: 8,
    onChunkReady: async (blob: Blob, info: ChunkInfo) => {
      if (!useGeminiRef.current || !isOnline || isFallbackActiveRef.current) return;

      setLastEmittedChunk({
        size: info.size,
        mimeType: info.mimeType,
        timestamp: info.timestamp,
      });

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
        if (text) {
          setLectureTranscript((prev) => (prev ? `${prev}\n${text}` : text));
          setGeminiTranscriptCount((prev) => prev + 1);
        }

        // Clean recovery to Cloud if previous state had an error
        setIsFallbackActive(false);
        setFallbackReason(null);
        setTranscribeError(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network/API error";
        setTranscribeError(msg);

        // SPEC F4: When Gemini returns an error or quota exhaustion while online,
        // app automatically switches to browser Web Speech API
        if (isOnline && isWebSpeechSupported) {
          setIsFallbackActive(true);
          setFallbackReason(msg);
          startWebSpeech();
        }
      } finally {
        setIsTranscribing(false);
      }
    },
  });

  // Handle Start / Stop Microphone
  const handleToggleMic = async () => {
    if (!isCapturing) {
      await startCapture();
      if (!useGemini || isFallbackActive) {
        startWebSpeech();
      }
    } else {
      stopCapture();
      stopWebSpeech();
    }
  };

  // Language switch (hot-swap)
  const handleLanguageChange = (newLang: SupportedLanguage) => {
    setSelectedLanguage(newLang);
    changeLanguage(newLang);
  };

  // Engine switch (Cloud Gemini vs manual Web Speech)
  const handleEngineToggle = (nextUseGemini: boolean) => {
    setUseGemini(nextUseGemini);
    setIsFallbackActive(false);
    setFallbackReason(null);
    setTranscribeError(null);

    if (isCapturing) {
      if (nextUseGemini) {
        stopWebSpeech();
      } else {
        startWebSpeech();
      }
    }
  };

  // SPEC F4: Clean recovery to Cloud operation from Browser Fallback
  const handleResumeCloud = () => {
    setIsFallbackActive(false);
    setFallbackReason(null);
    setTranscribeError(null);
    stopWebSpeech();
  };

  // F8: Clear transcript with confirmation
  const handleClearTranscript = () => {
    const confirmed = window.confirm(
      "Are you sure you want to clear the entire lecture transcript? This action cannot be undone."
    );
    if (confirmed) {
      clearWebSpeechTranscript();
      setLectureTranscript("");
      setTranscribeError(null);
      setUnreadCount(0);
      try {
        localStorage.removeItem("bayan_lecture_transcript");
      } catch {
        // Ignore
      }
    }
  };

  // F9: Copy all text
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const handleCopyAll = async () => {
    if (!lectureTranscript) return;

    try {
      await navigator.clipboard.writeText(lectureTranscript);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // F9: Download text as file
  const handleDownload = () => {
    if (!lectureTranscript) return;

    const dateStr = new Date().toISOString().split("T")[0];
    const blob = new Blob([lectureTranscript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bayan-Lecture-${dateStr}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Split into structured sentence blocks (F6 & F7)
  const sentences = useMemo(() => {
    return splitIntoSentences(lectureTranscript);
  }, [lectureTranscript]);

  const hasContent = sentences.length > 0;

  // Track sentence count for unread indicator when auto-scroll is paused
  const prevSentenceCountRef = useRef<number>(sentences.length);
  useEffect(() => {
    if (sentences.length > prevSentenceCountRef.current) {
      const added = sentences.length - prevSentenceCountRef.current;
      if (isScrollPaused) {
        setUnreadCount((prev) => prev + added);
      } else {
        // Scroll down smoothly
        captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
    prevSentenceCountRef.current = sentences.length;
  }, [sentences.length, isScrollPaused]);

  // Scroll to bottom manually
  const scrollToBottom = useCallback(() => {
    setIsScrollPaused(false);
    setUnreadCount(0);
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Compute active badge mode (SPEC F4)
  const activeMode: ModeBadgeType = !isOnline
    ? "offline"
    : !isCapturing
    ? "standby"
    : isFallbackActive
    ? "fallback"
    : useGemini
    ? "cloud"
    : "standby";

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between selection:bg-[#FFE600] selection:text-black">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-black/90 backdrop-blur sticky top-0 z-30 px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#FFE600] flex items-center justify-center text-black font-extrabold text-xl shadow-[0_0_15px_rgba(255,230,0,0.3)]">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white font-sans">
                  Bayan
                </h1>
                <span className="text-zinc-500 font-medium text-xs px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                  Captions
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 font-sans">
                Live Classroom Speech-to-Text
              </p>
            </div>
          </div>

          {/* Header Controls: Language Selector, Status Badge & Mic Status */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* SPEC F4: Active Mode Badge ("Cloud" vs "Browser Fallback") */}
            <StatusBadge mode={activeMode} isTranscribing={isTranscribing} />

            {/* Language Selector (Hot-swap) */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => handleLanguageChange("ur-PK")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer font-sans ${
                  selectedLanguage === "ur-PK"
                    ? "bg-[#FFE600] text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Switch to Urdu speech recognition"
              >
                Urdu
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange("en-US")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer font-sans ${
                  selectedLanguage === "en-US"
                    ? "bg-[#FFE600] text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
                title="Switch to English speech recognition"
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
              <span className="hidden sm:inline">
                {isCapturing ? "Mic Active" : "Mic Standby"}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Classroom Audio & Captions Hub */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 flex flex-col justify-center gap-5">
        {/* SPEC F4: Offline Notice Banner */}
        <OfflineBanner isOnline={isOnline} />

        {/* SPEC F4: Fallback Active Notice */}
        {isFallbackActive && isOnline && (
          <aside
            role="status"
            className="w-full bg-amber-950/60 border-2 border-amber-500/80 rounded-2xl p-4 text-amber-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden="true">
                🔄
              </span>
              <div className="space-y-0.5">
                <h4 className="font-bold text-white text-sm sm:text-base">
                  Browser Fallback Active
                </h4>
                <p className="text-xs text-amber-200/90 font-sans">
                  Gemini API limit/error encountered ({fallbackReason || "Quota Exceeded"}). Operating via browser-native Speech Recognition fallback so classroom captions continue uninterrupted.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResumeCloud}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-extrabold text-xs shrink-0 cursor-pointer transition-all shadow"
              title="Attempt to resume normal Gemini Cloud transcription"
            >
              ☁️ Resume Cloud
            </button>
          </aside>
        )}

        {/* Browser Support Warning (if Web Speech is completely missing) */}
        {!isWebSpeechSupported && (!useGemini || isFallbackActive) && (
          <div className="w-full bg-amber-950/50 border-2 border-amber-600/70 rounded-2xl p-4 text-amber-200">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">⚠️</span>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">
                  Browser Speech Recognition Not Supported
                </h3>
                <p className="text-sm text-amber-200/90 leading-relaxed">
                  Your browser does not support the Web Speech API. For full fallback support, please open this app in{" "}
                  <strong className="text-white underline">Google Chrome</strong> or{" "}
                  <strong className="text-white underline">Microsoft Edge</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Primary Controls & Engine Switcher */}
        <div className="flex flex-col items-center gap-3">
          {/* Start / Stop Button */}
          {!isCapturing ? (
            <button
              onClick={() => void handleToggleMic()}
              className="group relative flex items-center justify-center gap-3 px-8 py-3.5 bg-[#FFE600] hover:bg-[#ffe81a] active:scale-95 text-black font-extrabold text-base sm:text-lg rounded-2xl shadow-[0_0_25px_rgba(255,230,0,0.25)] transition-all cursor-pointer"
            >
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6 fill-current"
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
              className="flex items-center justify-center gap-3 px-8 py-3.5 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white font-bold text-base sm:text-lg rounded-2xl border border-zinc-700 shadow-lg transition-all cursor-pointer"
            >
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6 fill-current text-red-400 animate-pulse"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M6 6h12v12H6z" />
              </svg>
              <span>Stop Microphone</span>
            </button>
          )}

          {/* Engine Mode Switch (Gemini AI Cloud [Primary] vs Browser Speech) */}
          <div className="flex flex-col items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-2xl p-2.5 sm:px-5">
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-semibold ${
                  !useGemini ? "text-[#FFE600]" : "text-zinc-500"
                }`}
              >
                Browser Speech Only
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
                title="Toggle between Cloud Gemini AI and Browser Web Speech"
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
                Gemini Cloud Mode (Primary)
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 text-center">
              {useGemini
                ? isFallbackActive
                  ? "⚠️ Operating via Browser Web Speech Fallback due to Gemini API limits"
                  : "⚡ Gemini 3.8 Flash Cloud STT active (with automatic Browser Speech fallback)"
                : "⚡ Browser Web Speech active"}
            </p>
          </div>

          {/* Mic Guidance Messages */}
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

          {webSpeechError && (!useGemini || isFallbackActive) && (
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
        <div className="w-full max-w-2xl mx-auto rounded-3xl border-2 border-zinc-800 bg-zinc-950 p-4 sm:p-6 shadow-2xl space-y-4">
          {/* Card Header with Status Badge (SPEC F4) & Font Controls (F5) */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FFE600] animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Live Classroom Captions
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                {selectedLanguage === "ur-PK" ? "Urdu" : "English"}
              </span>

              {/* SPEC F4 Status Badge */}
              <StatusBadge mode={activeMode} isTranscribing={isTranscribing} />

              {useGemini && !isFallbackActive && isCapturing && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  ({geminiTranscriptCount} Chunks)
                </span>
              )}
            </div>

            {/* Reading & Font Size Controls (SPEC F5) */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[11px] text-zinc-400 font-medium mr-1 hidden sm:inline">
                Font Size:
              </span>
              <button
                type="button"
                onClick={zoomOut}
                disabled={fontSize === "md"}
                className="h-7 w-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-200 font-bold text-sm border border-zinc-700 flex items-center justify-center cursor-pointer transition-colors"
                title="Zoom Out (Decrease font size)"
              >
                -
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="h-7 px-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-zinc-300 border border-zinc-700 flex items-center justify-center cursor-pointer transition-colors uppercase"
                title="Reset Font Size"
              >
                {fontSize}
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={fontSize === "2xl"}
                className="h-7 w-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-200 font-bold text-sm border border-zinc-700 flex items-center justify-center cursor-pointer transition-colors"
                title="Zoom In (Increase font size)"
              >
                +
              </button>

              {/* SPEC F7: Scroll Pause / Resume Button */}
              <button
                type="button"
                onClick={() => {
                  if (isScrollPaused) {
                    scrollToBottom();
                  } else {
                    setIsScrollPaused(true);
                  }
                }}
                className={`h-7 px-2.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer transition-colors ${
                  isScrollPaused
                    ? "bg-[#FFE600]/20 text-[#FFE600] border-[#FFE600]/50"
                    : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-white"
                }`}
                title={isScrollPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
              >
                <span>{isScrollPaused ? "▶ Resume Scroll" : "⏸ Pause Scroll"}</span>
              </button>
            </div>
          </div>

          {/* Action Toolbar: Copy, Download, Clear */}
          {hasContent && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900/60 border border-zinc-800/90 rounded-xl px-3 py-2 text-xs">
              <span className="text-zinc-400 font-mono">
                {sentences.length} {sentences.length === 1 ? "sentence" : "sentences"} recorded
              </span>

              <div className="flex items-center gap-2">
                {/* Copy All (F9) */}
                <button
                  type="button"
                  onClick={() => void handleCopyAll()}
                  className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Copy All Text"
                >
                  <span>{isCopied ? "✓ Copied to Clipboard" : "📋 Copy All Text"}</span>
                </button>

                {/* Download .txt (F9) */}
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Download lecture notes as text file"
                >
                  <span>💾 Download (.txt)</span>
                </button>

                {/* Clear / New Lecture (F8) */}
                <button
                  type="button"
                  onClick={handleClearTranscript}
                  className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-300 border border-zinc-700 hover:border-red-800 transition-colors cursor-pointer"
                  title="Clear all captions"
                >
                  <span>🗑️ Clear Transcript</span>
                </button>
              </div>
            </div>
          )}

          {/* Captions Text Presentation Area (Sentence-by-Sentence Stream F6 & F7) */}
          <div
            ref={scrollContainerRef}
            className="min-h-[180px] max-h-[460px] overflow-y-auto rounded-2xl bg-black border border-zinc-800/90 p-3 sm:p-5 flex flex-col gap-3 relative scroll-smooth"
          >
            {transcribeError && useGemini && !isFallbackActive ? (
              <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/60 space-y-1">
                <p className="text-xs text-red-400 font-bold uppercase tracking-wider">
                  Transcription Error
                </p>
                <p className="text-sm text-red-300 font-mono break-words">
                  {transcribeError}
                </p>
              </div>
            ) : null}

            {hasContent ? (
              <div className="space-y-3">
                {sentences.map((sentence, idx) => (
                  <BilingualCaption
                    key={idx}
                    text={sentence}
                    fontSizeClass={FONT_SIZE_CLASSES[fontSize]}
                    showLanguageBadge={true}
                  />
                ))}

                {/* Live Interim Streaming Caption (Active in Web Speech or Fallback mode) */}
                {(!useGemini || isFallbackActive) && interimTranscript && (
                  <BilingualCaption
                    text={interimTranscript}
                    isInterim={true}
                    fontSizeClass={FONT_SIZE_CLASSES[fontSize]}
                    showLanguageBadge={true}
                  />
                )}
              </div>
            ) : !transcribeError ? (
              <div className="my-auto py-12 flex flex-col items-center justify-center text-center space-y-2">
                <div className="h-10 w-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#FFE600]">
                  🎙️
                </div>
                <p className="text-sm sm:text-base text-zinc-300 font-medium font-sans max-w-md">
                  {!isCapturing
                    ? "Turn on the microphone to begin classroom captioning."
                    : "Listening for speech... Live captions will appear here as soon as the teacher speaks."}
                </p>
                <p className="text-xs text-zinc-500 font-sans">
                  {!isCapturing
                    ? "Captions will automatically format and display in real-time."
                    : "Microphone is active and monitoring room audio."}
                </p>
              </div>
            ) : null}

            {/* Scroll bottom anchor */}
            <div ref={captionsEndRef} />
          </div>

          {/* Sticky Unread Pill when Scroll is Paused (F7) */}
          {isScrollPaused && unreadCount > 0 && (
            <div className="flex justify-center -mt-2">
              <button
                type="button"
                onClick={scrollToBottom}
                className="px-4 py-1.5 rounded-full bg-[#FFE600] text-black font-bold text-xs shadow-lg flex items-center gap-2 hover:bg-[#ffe81a] animate-bounce cursor-pointer"
              >
                <span>↓ {unreadCount} new {unreadCount === 1 ? "sentence" : "sentences"} received — Click to jump to latest</span>
              </button>
            </div>
          )}

          {/* Engine & Diagnostics Footer Bar */}
          <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono pt-1">
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full inline-block ${
                  !isOnline
                    ? "bg-red-500"
                    : isFallbackActive
                    ? "bg-amber-400 animate-pulse"
                    : isCapturing
                    ? "bg-emerald-500"
                    : "bg-zinc-600"
                }`}
              />
              Engine:{" "}
              {activeMode === "fallback" ? (
                <strong className="text-amber-300">
                  Browser Web Speech (Fallback Active)
                </strong>
              ) : activeMode === "offline" ? (
                <strong className="text-red-400">Offline (Paused)</strong>
              ) : useGemini ? (
                <strong className="text-zinc-200">
                  Gemini 3.8 Flash (Server Chunker)
                </strong>
              ) : (
                <strong className="text-[#FFE600]">
                  Browser Web Speech API (Client)
                </strong>
              )}
            </span>
            <span>
              {!isOnline
                ? "Network Disconnected"
                : isFallbackActive
                ? isWebSpeechListening
                  ? `Fallback Streaming (${selectedLanguage})`
                  : "Fallback Standby"
                : useGemini
                ? "Route: POST /api/transcribe"
                : isWebSpeechListening
                ? `Listening (${selectedLanguage})`
                : "Standby"}
            </span>
          </div>
        </div>

        {/* Gemini Chunker Diagnostics (Visible if Gemini Mode is ON & Online & not in fallback) */}
        {useGemini && (
          <div className="w-full max-w-2xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-lg space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-xs font-bold text-zinc-300">
                Gemini Chunker VAD Monitor (3.5s cycles)
              </span>
              <span className="text-xs font-mono text-zinc-400">
                Status: {!isOnline ? "offline" : isFallbackActive ? "fallback_paused" : chunkStatus}
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

      {/* Footer with Mandatory Privacy Notice */}
      <footer className="border-t border-zinc-900 bg-black px-4 py-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-2">
          {/* Privacy Notice Required by Guidelines & SPEC */}
          <div className="inline-block bg-zinc-900/90 border border-zinc-800 px-4 py-2.5 rounded-xl">
            <p className="text-xs sm:text-sm text-zinc-300 font-medium">
              🔒 <span className="text-[#FFE600]">Audio is sent to Google for transcription only; it is never saved.</span>
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Audio is processed in ephemeral memory for assistive classroom captions only. No audio is ever stored on disk or recorded.
            </p>
          </div>
          <p className="text-[11px] text-zinc-500">
            Bayan — Zero-install assistive lecture tool for physical classrooms.
          </p>
        </div>
      </footer>
    </div>
  );
}
