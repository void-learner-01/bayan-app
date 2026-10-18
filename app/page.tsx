"use client";

import React from "react";
import { useAudioCapture } from "@/hooks/useAudioCapture";
import { VolumeMeter } from "@/components/VolumeMeter";

export default function Home() {
  const {
    isCapturing,
    volume,
    isSoundDetected,
    permissionStatus,
    errorMessage,
    startCapture,
    stopCapture,
  } = useAudioCapture(8);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between selection:bg-[#FFE600] selection:text-black">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-black/80 backdrop-blur px-4 py-3 sm:px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
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

      {/* Main Classroom Audio Hub */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 sm:px-6 flex flex-col justify-center gap-6">
        {/* Intro Hero */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Classroom Microphone Monitor
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base max-w-lg mx-auto">
            Place your laptop or phone on your desk facing your teacher. Start the
            mic to verify sound capture before lecture transcription begins.
          </p>
        </div>

        {/* Primary Controls */}
        <div className="flex flex-col items-center gap-4">
          {!isCapturing ? (
            <button
              onClick={() => void startCapture()}
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
              onClick={stopCapture}
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

          {/* Permission Prompt Friendly Guidance */}
          {permissionStatus === "idle" && (
            <p className="text-xs text-zinc-400 text-center max-w-sm">
              Pressing &quot;Start Microphone&quot; will ask for browser microphone permission.
              Please click &quot;Allow&quot; in the browser prompt.
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

          {permissionStatus === "unsupported" && errorMessage && (
            <div className="w-full max-w-md bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 text-center">
              <p className="text-sm font-semibold text-amber-300 mb-1">
                Browser Not Supported
              </p>
              <p className="text-xs text-amber-200">{errorMessage}</p>
            </div>
          )}
        </div>

        {/* Live Volume Meter Component */}
        <div className="w-full max-w-xl mx-auto">
          <VolumeMeter
            volume={volume}
            isCapturing={isCapturing}
            isSoundDetected={isSoundDetected}
          />
        </div>
      </main>

      {/* Footer with Mandatory Privacy Notice */}
      <footer className="border-t border-zinc-900 bg-black px-4 py-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center space-y-2">
          {/* Privacy Notice from SPEC.md & CLAUDE.md */}
          <div className="inline-block bg-zinc-900/90 border border-zinc-800 px-4 py-2 rounded-xl">
            <p className="text-xs sm:text-sm text-zinc-300 font-medium">
              🔒 <span className="text-[#FFE600]">Awaz transcription ke liye Google ko bheji jati hai, save nahi hoti.</span>
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Audio is transmitted for real-time transcription only. No audio is ever recorded to disk or saved.
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
