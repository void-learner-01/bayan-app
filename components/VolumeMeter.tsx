"use client";

import React from "react";

interface VolumeMeterProps {
  volume: number; // 0 to 100
  isCapturing: boolean;
  isSoundDetected: boolean;
}

export function VolumeMeter({
  volume,
  isCapturing,
  isSoundDetected,
}: VolumeMeterProps) {
  // Generate 16 bars for the waveform meter
  const totalBars = 16;
  const bars = Array.from({ length: totalBars }, (_, index) => {
    if (!isCapturing || volume === 0) return 6; // minimum idle height (px)

    // Center-weighted waveform simulation based on real volume
    const normalizedIndex = Math.abs(index - (totalBars - 1) / 2) / ((totalBars - 1) / 2);
    const weight = Math.cos(normalizedIndex * (Math.PI / 2.5));
    // Bar height from 6px to 54px
    const dynamicHeight = Math.max(6, Math.min(54, Math.round(weight * (volume * 0.54))));
    return dynamicHeight;
  });

  return (
    <div
      className="w-full rounded-2xl border-2 border-zinc-800 bg-zinc-950 p-4 md:p-6 shadow-xl transition-all"
      aria-label="Microphone Live Volume Meter"
    >
      {/* Header Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* Pulsing Status Dot */}
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full transition-all duration-150 ${
              !isCapturing
                ? "bg-zinc-600"
                : isSoundDetected
                ? "bg-[#FFE600] shadow-[0_0_12px_#FFE600] scale-110"
                : "bg-emerald-500/70"
            }`}
          />
          <span className="text-sm font-semibold tracking-wide uppercase text-zinc-300">
            {!isCapturing
              ? "Mic Inactive"
              : isSoundDetected
              ? "Sound Detected"
              : "Listening (Quiet)"}
          </span>
        </div>

        {/* Volume Level Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 font-mono">Input Level:</span>
          <span
            className={`font-mono text-sm font-bold px-2.5 py-0.5 rounded-full border ${
              !isCapturing
                ? "bg-zinc-900 text-zinc-500 border-zinc-800"
                : isSoundDetected
                ? "bg-[#FFE600]/15 text-[#FFE600] border-[#FFE600]/40"
                : "bg-zinc-800 text-zinc-300 border-zinc-700"
            }`}
          >
            {isCapturing ? `${volume}%` : "0%"}
          </span>
        </div>
      </div>

      {/* Waveform Bars Display */}
      <div className="flex items-center justify-between gap-1.5 h-16 px-2 py-1 bg-black rounded-xl border border-zinc-900">
        {bars.map((height, i) => (
          <div
            key={i}
            className="flex-1 flex items-center justify-center h-full"
          >
            <div
              style={{ height: `${height}px` }}
              className={`w-full max-w-[8px] rounded-full transition-all duration-75 ${
                !isCapturing
                  ? "bg-zinc-800"
                  : isSoundDetected
                  ? "bg-[#FFE600]"
                  : "bg-zinc-600"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Linear Progress Bar */}
      <div className="mt-3 w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800">
        <div
          className={`h-full transition-all duration-75 ease-out rounded-full ${
            !isCapturing
              ? "w-0 bg-zinc-700"
              : isSoundDetected
              ? "bg-[#FFE600]"
              : "bg-emerald-400"
          }`}
          style={{ width: `${isCapturing ? volume : 0}%` }}
          role="progressbar"
          aria-valuenow={volume}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Classroom Desk Visual Hint */}
      <p className="mt-2 text-center text-xs text-zinc-400">
        {isCapturing
          ? isSoundDetected
            ? "Teacher / room sound is reaching the microphone."
            : "No active speech detected. Adjust laptop distance if needed."
          : "Click 'Start Microphone' above to test desk microphone pickup."}
      </p>
    </div>
  );
}
