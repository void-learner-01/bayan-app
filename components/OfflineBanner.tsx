"use client";

import React from "react";

interface OfflineBannerProps {
  isOnline: boolean;
}

/**
 * SPEC F4: Offline Notice Banner
 * Displays a prominent high-contrast banner when the student's device
 * loses internet connectivity, notifying them that transcription is paused.
 */
export function OfflineBanner({ isOnline }: OfflineBannerProps) {
  if (isOnline) return null;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="w-full bg-red-950/90 border-2 border-red-500 rounded-2xl p-4 text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.25)] animate-pulse"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            ⚠️
          </span>
          <div className="space-y-0.5">
            <h3 className="font-bold text-white text-sm sm:text-base tracking-tight">
              Offline — Internet disconnected, transcription paused
            </h3>
            <p className="text-xs text-red-200/90 font-sans">
              Live transcription is paused while disconnected. Captions will automatically resume once internet connectivity is restored.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 text-xs font-black tracking-wider rounded-full bg-red-900 text-white border border-red-600 shrink-0 uppercase">
          Offline
        </span>
      </div>
    </aside>
  );
}
