"use client";

import React from "react";

export type ModeBadgeType = "cloud" | "fallback" | "offline" | "standby";

interface StatusBadgeProps {
  mode: ModeBadgeType;
  isTranscribing?: boolean;
  className?: string;
}

/**
 * SPEC F4: Status Badge
 * Explicit acceptance criteria:
 * - "Cloud" badge when Gemini API is transcribing.
 * - "Browser Fallback" badge when operating via browser-native STT due to API error/quota.
 */
export function StatusBadge({
  mode,
  isTranscribing = false,
  className = "",
}: StatusBadgeProps) {
  if (mode === "offline") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-950/80 text-red-300 border border-red-700/80 uppercase tracking-wide ${className}`}
      >
        <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
        Offline
      </span>
    );
  }

  if (mode === "fallback") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-600/70 uppercase tracking-wide shadow-sm ${className}`}
        title="Operating via browser-native Speech Recognition due to Gemini API error/quota"
      >
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        Browser Fallback
      </span>
    );
  }

  if (mode === "cloud") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
          isTranscribing
            ? "bg-[#FFE600]/20 text-[#FFE600] border-[#FFE600]/40 shadow-[0_0_12px_rgba(255,230,0,0.2)]"
            : "bg-zinc-900 text-zinc-300 border-zinc-700"
        } ${className}`}
        title="Transcribing with Google Gemini Cloud STT"
      >
        <span
          className={`h-2 w-2 rounded-full ${
            isTranscribing ? "bg-[#FFE600] animate-pulse" : "bg-emerald-400"
          }`}
        />
        Cloud
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 ${className}`}
    >
      <span className="h-2 w-2 rounded-full bg-zinc-600" />
      Standby
    </span>
  );
}
