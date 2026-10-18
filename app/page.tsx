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

  const [useGroq, setUseGroq] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem("bayan_engine_mode");
      return saved === null ? true : saved === "groq";
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

  const [isFallbackActive, setIsFallbackActive] = useState<boolean>(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

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
  const [groqTranscriptCount, setGroqTranscriptCount] = useState<number>(0);
  const [lastEmittedChunk, setLastEmittedChunk] = useState<{
    size: number;
    mimeType: string;
    timestamp: number;
  } | null>(null);

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

  const captionsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isScrollPaused, setIsScrollPaused] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    try {
      if (lectureTranscript) {
        localStorage.setItem("bayan_lecture_transcript", lectureTranscript);
      }
      localStorage.setItem("bayan_engine_mode", useGroq ? "groq" : "webspeech");
      localStorage.setItem("bayan_language", selectedLanguage);
      localStorage.setItem("bayan_font_size", fontSize);
    } catch {
      // Ignore write errors
    }
  }, [lectureTranscript, useGroq, selectedLanguage, fontSize]);

  const useGroqRef = useRef<boolean>(useGroq);
  useEffect(() => {
    useGroqRef.current = useGroq;
  }, [useGroq]);

  const isFallbackActiveRef = useRef<boolean>(isFallbackActive);
  useEffect(() => {
    isFallbackActiveRef.current = isFallbackActive;
  }, [isFallbackActive]);

  useEffect(() => {
    if (!isOnline) {
      stopWebSpeech();
    } else {
      if (isCapturing && useGroq) {
        startTransition(() => {
          setIsFallbackActive(false);
          setFallbackReason(null);
          setTranscribeError(null);
        });
        stopWebSpeech();
      }
    }
  }, [isOnline, isCapturing, useGroq, stopWebSpeech]);

  const {
    chunkStatus,
    totalCycles,
    speechChunksCount,
    discardedChunksCount,
    lastChunkInfo,
    activeMimeType,
  } = useAudioChunker({
    stream,
    isCapturing: isCapturing && useGroq && isOnline && !isFallbackActive,
    volume,
    isSoundDetected,
    chunkDurationMs: 3000,
    silenceThreshold: 8,
    onChunkReady: async (blob: Blob, info: ChunkInfo) => {
      if (!useGroqRef.current || !isOnline || isFallbackActiveRef.current) return;

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
        const res = await fetch("/api/caption", {
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
          setGroqTranscriptCount((prev) => prev + 1);
        }

        setIsFallbackActive(false);
        setFallbackReason(null);
        setTranscribeError(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Network/API error";
        setTranscribeError(msg);

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

  const handleToggleMic = async () => {
    if (!isCapturing) {
      await startCapture();
      if (!useGroq || isFallbackActive) {
        startWebSpeech();
      }
    } else {
      stopCapture();
      stopWebSpeech();
    }
  };

  const handleLanguageChange = (newLang: SupportedLanguage) => {
    setSelectedLanguage(newLang);
    changeLanguage(newLang);
  };

  const handleEngineToggle = (nextUseGroq: boolean) => {
    setUseGroq(nextUseGroq);
    setIsFallbackActive(false);
    setFallbackReason(null);
    setTranscribeError(null);

    if (isCapturing) {
      if (nextUseGroq) {
        stopWebSpeech();
      } else {
        startWebSpeech();
      }
    }
  };

  const handleResumeCloud = () => {
    setIsFallbackActive(false);
    setFallbackReason(null);
    setTranscribeError(null);
    stopWebSpeech();
  };

  const handleClearTranscript = () => {
    const confirmed = window.confirm(
      "Are you sure you want to clear the entire lecture transcript?"
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

  const sentences = useMemo(() => {
    return splitIntoSentences(lectureTranscript);
  }, [lectureTranscript]);

  const hasContent = sentences.length > 0;

  const prevSentenceCountRef = useRef<number>(sentences.length);
  useEffect(() => {
    if (sentences.length > prevSentenceCountRef.current) {
      const added = sentences.length - prevSentenceCountRef.current;
      if (isScrollPaused) {
        setUnreadCount((prev) => prev + added);
      } else {
        captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
    prevSentenceCountRef.current = sentences.length;
  }, [sentences.length, isScrollPaused]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 40;
      if (atBottom) {
        setIsScrollPaused(false);
        setUnreadCount(0);
      } else {
        setIsScrollPaused(true);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToBottom = useCallback(() => {
    setIsScrollPaused(false);
    setUnreadCount(0);
    captionsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const activeMode: ModeBadgeType = !isOnline
    ? "offline"
    : !isCapturing
    ? "standby"
    : isFallbackActive
    ? "fallback"
    : useGroq
    ? "cloud"
    : "standby";

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-between selection:bg-[#FFE600] selection:text-black font-sans">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#FFE600] to-amber-500 flex items-center justify-center text-black font-black text-2xl shadow-[0_0_20px_rgba(255,230,0,0.3)]">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-white">
                  Bayan
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                  Whisper AI
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Live Bilingual Classroom Speech-to-Text
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <StatusBadge mode={activeMode} isTranscribing={isTranscribing} />

            <div className="flex items-center bg-zinc-900/90 border border-zinc-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => handleLanguageChange("ur-PK")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  selectedLanguage === "ur-PK"
                    ? "bg-[#FFE600] text-black shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                Urdu
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

            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                isCapturing
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-zinc-900 text-zinc-400 border-zinc-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isCapturing ? "bg-amber-400 animate-ping" : "bg-zinc-600"
                }`}
              />
              <span className="hidden sm:inline">
                {isCapturing ? "Mic Active" : "Mic Standby"}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 flex flex-col justify-center gap-6">
        <OfflineBanner isOnline={isOnline} />

        {isFallbackActive && isOnline && (
          <aside className="w-full bg-amber-950/40 border border-amber-500/40 rounded-2xl p-4 text-amber-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 backdrop-blur shadow-xl">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h4 className="font-bold text-white text-sm">
                  Browser Fallback Active
                </h4>
                <p className="text-xs text-amber-200/80">
                  Operating via Web Speech API fallback ({fallbackReason || "Groq limit"}).
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleResumeCloud}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs cursor-pointer transition-all shadow-md"
            >
              Resume Groq Whisper
            </button>
          </aside>
        )}

        {/* Start / Stop Section */}
        <div className="flex flex-col items-center gap-4">
          {!isCapturing ? (
            <button
              onClick={() => void handleToggleMic()}
              className="group relative flex items-center justify-center gap-3 px-10 py-4 bg-gradient-to-r from-[#FFE600] to-amber-400 hover:from-[#ffe81a] hover:to-amber-300 active:scale-95 text-black font-extrabold text-lg sm:text-xl rounded-2xl shadow-[0_0_30px_rgba(255,230,0,0.3)] transition-all cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
              <span>Start Microphone</span>
            </button>
          ) : (
            <button
              onClick={() => void handleToggleMic()}
              className="flex items-center justify-center gap-3 px-10 py-4 bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-white font-bold text-lg sm:text-xl rounded-2xl border border-red-500/40 shadow-xl transition-all cursor-pointer"
            >
              <svg className="w-6 h-6 fill-current text-red-500 animate-pulse" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
              <span>Stop Microphone</span>
            </button>
          )}

          {/* Engine Selector */}
          <div className="flex flex-col items-center gap-2 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl px-5 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold ${!useGroq ? "text-[#FFE600]" : "text-zinc-500"}`}>
                Browser Speech
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={useGroq}
                onClick={() => handleEngineToggle(!useGroq)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  useGroq ? "bg-[#FFE600]" : "bg-zinc-800"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
                    useGroq ? "translate-x-6 bg-black" : "translate-x-1 bg-white"
                  }`}
                />
              </button>

              <span className={`text-xs font-semibold ${useGroq ? "text-[#FFE600]" : "text-zinc-500"}`}>
                Groq Whisper Turbo (Primary)
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 text-center">
              {useGroq
                ? isFallbackActive
                  ? "⚡ Operating via Browser Speech Fallback"
                  : "⚡ Groq Whisper-v3-Turbo High-Speed STT Active"
                : "⚡ Browser Web Speech API Active"}
            </p>
          </div>
        </div>

        {/* Volume Meter */}
        <div className="w-full max-w-2xl mx-auto">
          <VolumeMeter volume={volume} isCapturing={isCapturing} isSoundDetected={isSoundDetected} />
        </div>

        {/* Live Captions Area */}
        <div className="w-full max-w-2xl mx-auto rounded-3xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-xl p-5 sm:p-6 shadow-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#FFE600] animate-ping" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                Live Classroom Captions
              </h2>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                {selectedLanguage === "ur-PK" ? "Urdu" : "English"}
              </span>

              <StatusBadge mode={activeMode} isTranscribing={isTranscribing} />

              {useGroq && !isFallbackActive && isCapturing && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  ({groqTranscriptCount} Chunks)
                </span>
              )}
            </div>

            {/* Font Controls */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={zoomOut}
                disabled={fontSize === "md"}
                className="h-7 w-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-bold text-sm border border-zinc-700 flex items-center justify-center cursor-pointer"
              >
                -
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="h-7 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 border border-zinc-700 flex items-center justify-center cursor-pointer uppercase"
              >
                {fontSize}
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={fontSize === "2xl"}
                className="h-7 w-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 font-bold text-sm border border-zinc-700 flex items-center justify-center cursor-pointer"
              >
                +
              </button>

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
                    : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                }`}
              >
                <span>{isScrollPaused ? "▶ Resume" : "⏸ Pause"}</span>
              </button>
            </div>
          </div>

          {/* Action Toolbar */}
          {hasContent && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-zinc-900/80 border border-zinc-800/90 rounded-xl px-3 py-2 text-xs">
              <span className="text-zinc-400 font-mono">
                {sentences.length} {sentences.length === 1 ? "sentence" : "sentences"}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyAll()}
                  className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                >
                  <span>{isCopied ? "✓ Copied" : "📋 Copy"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors cursor-pointer"
                >
                  <span>💾 Download</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearTranscript}
                  className="px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-red-950/60 text-zinc-400 hover:text-red-300 border border-zinc-700 transition-colors cursor-pointer"
                >
                  <span>🗑️ Clear</span>
                </button>
              </div>
            </div>
          )}

          {/* Captions Text Output */}
          <div
            ref={scrollContainerRef}
            className="min-h-[220px] max-h-[480px] overflow-y-auto rounded-2xl bg-zinc-950/80 border border-zinc-800/80 p-4 sm:p-5 flex flex-col gap-3 relative scroll-smooth shadow-inner"
          >
            {transcribeError && useGroq && !isFallbackActive ? (
              <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/60 space-y-1">
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

                {(!useGroq || isFallbackActive) && interimTranscript && (
                  <BilingualCaption
                    text={interimTranscript}
                    isInterim={true}
                    fontSizeClass={FONT_SIZE_CLASSES[fontSize]}
                    showLanguageBadge={true}
                  />
                )}
              </div>
            ) : !transcribeError ? (
              <div className="my-auto py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#FFE600] text-xl shadow-inner">
                  🎙️
                </div>
                <p className="text-sm sm:text-base text-zinc-300 font-medium max-w-md">
                  {!isCapturing
                    ? "Start the microphone to begin real-time speech captioning."
                    : "Listening for teacher speech... Captions will stream here instantly."}
                </p>
              </div>
            ) : null}

            {isScrollPaused && unreadCount > 0 && (
              <div className="sticky bottom-0 left-0 right-0 flex justify-center pt-2 pb-1">
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="px-4 py-1.5 rounded-full bg-[#FFE600] text-black font-bold text-xs shadow-[0_0_20px_rgba(255,230,0,0.4)] flex items-center gap-2 hover:bg-[#ffe81a] animate-bounce cursor-pointer"
                >
                  ↓ {unreadCount} new {unreadCount === 1 ? "sentence" : "sentences"}
                </button>
              </div>
            )}

            <div ref={captionsEndRef} />
          </div>

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
              {useGroq ? (
                <strong className="text-amber-400">Groq Whisper Turbo</strong>
              ) : (
                <strong className="text-[#FFE600]">Browser Web Speech</strong>
              )}
            </span>
            <span>Route: POST /api/caption</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 px-4 py-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-2">
          <div className="inline-block bg-zinc-900/90 border border-zinc-800/80 px-4 py-2.5 rounded-xl backdrop-blur">
            <p className="text-xs sm:text-sm text-zinc-300 font-medium">
              🔒 <span className="text-[#FFE600]">Audio is transcribed via Groq Cloud in ephemeral memory; it is never saved.</span>
            </p>
          </div>
          <p className="text-[11px] text-zinc-400">
            Bayan — Zero-install bilingual assistive lecture tool for classrooms.
          </p>
        </div>
      </footer>
    </div>
  );
}