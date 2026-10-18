"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface ChunkInfo {
  size: number; // in bytes
  avgVolume: number; // 0 to 100
  durationMs: number;
  timestamp: number;
  mimeType: string;
}

export type ChunkStatus =
  | "idle"
  | "recording"
  | "speech"
  | "silence_discarded";

type ActiveCycleStatus = "recording" | "speech" | "silence_discarded";

export interface UseAudioChunkerOptions {
  stream: MediaStream | null;
  isCapturing: boolean;
  volume: number; // Current live volume (0 - 100)
  isSoundDetected: boolean;
  chunkDurationMs?: number; // 3000 to 4000 ms (default 3500)
  silenceThreshold?: number; // Volume threshold below which audio is discarded (default 8)
  onChunkReady?: (blob: Blob, info: ChunkInfo) => void;
}

export interface AudioChunkerState {
  chunkStatus: ChunkStatus;
  totalCycles: number;
  speechChunksCount: number;
  discardedChunksCount: number;
  lastChunkInfo: ChunkInfo | null;
  activeMimeType: string;
}

/**
 * Detect the best supported audio MIME type across modern browsers.
 */
function getPreferredMimeType(): string {
  if (typeof window === "undefined" || !("MediaRecorder" in window)) {
    return "";
  }

  const preferredOrder = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/aac",
  ];

  for (const mime of preferredOrder) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }

  return "";
}

export function useAudioChunker({
  stream,
  isCapturing,
  volume,
  isSoundDetected,
  chunkDurationMs = 3500,
  silenceThreshold = 8,
  onChunkReady,
}: UseAudioChunkerOptions): AudioChunkerState {
  const [cycleStatus, setCycleStatus] = useState<ActiveCycleStatus>("recording");
  const [totalCycles, setTotalCycles] = useState<number>(0);
  const [speechChunksCount, setSpeechChunksCount] = useState<number>(0);
  const [discardedChunksCount, setDiscardedChunksCount] = useState<number>(0);
  const [lastChunkInfo, setLastChunkInfo] = useState<ChunkInfo | null>(null);
  const [activeMimeType, setActiveMimeType] = useState<string>("");

  // Refs to avoid stale closures in setTimeout/event handlers
  const streamRef = useRef<MediaStream | null>(stream);
  const isCapturingRef = useRef<boolean>(isCapturing);
  const volumeRef = useRef<number>(volume);
  const isSoundDetectedRef = useRef<boolean>(isSoundDetected);
  const silenceThresholdRef = useRef<number>(silenceThreshold);
  const onChunkReadyRef = useRef(onChunkReady);

  // Sync refs outside render in an effect
  useEffect(() => {
    streamRef.current = stream;
    isCapturingRef.current = isCapturing;
    volumeRef.current = volume;
    isSoundDetectedRef.current = isSoundDetected;
    silenceThresholdRef.current = silenceThreshold;
    onChunkReadyRef.current = onChunkReady;
  });

  // MediaRecorder & timer tracking refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cycleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sampleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordedBlobsRef = useRef<Blob[]>([]);

  // Statistics for current recording cycle
  const volumeSumRef = useRef<number>(0);
  const sampleCountRef = useRef<number>(0);
  const speechSamplesCountRef = useRef<number>(0);

  // Ref to hold the cycle starter to safely support recursion without lint violations
  const startCycleRef = useRef<() => void>(() => {});

  // Clean up all active recording, timers and intervals
  const stopAllRecording = useCallback(() => {
    if (cycleTimeoutRef.current) {
      clearTimeout(cycleTimeoutRef.current);
      cycleTimeoutRef.current = null;
    }

    if (sampleIntervalRef.current) {
      clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore stop error during teardown
      }
      recorderRef.current = null;
    }

    recordedBlobsRef.current = [];
  }, []);

  // Update startCycleRef implementation whenever chunkDurationMs changes
  useEffect(() => {
    startCycleRef.current = () => {
      if (!isCapturingRef.current || !streamRef.current || !streamRef.current.active) {
        return;
      }

      // Reset current cycle accumulators
      recordedBlobsRef.current = [];
      volumeSumRef.current = 0;
      sampleCountRef.current = 0;
      speechSamplesCountRef.current = 0;

      const mime = getPreferredMimeType();
      setActiveMimeType(mime);

      try {
        const options: MediaRecorderOptions = mime ? { mimeType: mime } : {};
        const recorder = new MediaRecorder(streamRef.current, options);
        recorderRef.current = recorder;

        recorder.onstart = () => {
          setCycleStatus("recording");
        };

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            recordedBlobsRef.current.push(event.data);
          }
        };

        recorder.onstop = () => {
          // Clear the 100ms volume sampling timer
          if (sampleIntervalRef.current) {
            clearInterval(sampleIntervalRef.current);
            sampleIntervalRef.current = null;
          }

          const totalSamples = sampleCountRef.current;
          const avgVol = totalSamples > 0 ? volumeSumRef.current / totalSamples : 0;
          const speechCount = speechSamplesCountRef.current;

          const effectiveMime = recorder.mimeType || mime || "audio/webm";
          const completeBlob = new Blob(recordedBlobsRef.current, {
            type: effectiveMime,
          });
          recordedBlobsRef.current = [];

          // VAD Decision: Voice activity vs Silence
          // Speech is confirmed if speech was detected in >= 2 samples (>= 200ms) or average volume >= threshold
          const hasSpeech =
            speechCount >= 2 || avgVol >= silenceThresholdRef.current;

          setTotalCycles((prev) => prev + 1);

          const chunkInfo: ChunkInfo = {
            size: completeBlob.size,
            avgVolume: Math.round(avgVol),
            durationMs: chunkDurationMs,
            timestamp: Date.now(),
            mimeType: effectiveMime,
          };

          if (hasSpeech && completeBlob.size > 0) {
            // Voice detected: emit complete standalone chunk
            setSpeechChunksCount((prev) => prev + 1);
            setCycleStatus("speech");
            setLastChunkInfo(chunkInfo);
            onChunkReadyRef.current?.(completeBlob, chunkInfo);
          } else {
            // Silence detected: discard chunk, no downstream API call
            setDiscardedChunksCount((prev) => prev + 1);
            setCycleStatus("silence_discarded");
            setLastChunkInfo(chunkInfo);
          }

          // Discrete restart: If capture is still active, immediately start next cycle
          if (isCapturingRef.current && streamRef.current && streamRef.current.active) {
            startCycleRef.current();
          }
        };

        recorder.onerror = () => {
          if (isCapturingRef.current) {
            setTimeout(() => {
              if (isCapturingRef.current) {
                startCycleRef.current();
              }
            }, 500);
          }
        };

        // Start recording
        recorder.start();

        // Sample volume every 100ms for RMS / VAD analysis during this chunk
        sampleIntervalRef.current = setInterval(() => {
          sampleCountRef.current += 1;
          const currentVol = volumeRef.current;
          volumeSumRef.current += currentVol;

          if (
            isSoundDetectedRef.current ||
            currentVol >= silenceThresholdRef.current
          ) {
            speechSamplesCountRef.current += 1;
          }
        }, 100);

        // Stop recorder after chunkDurationMs (e.g. 3500ms)
        cycleTimeoutRef.current = setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          }
        }, chunkDurationMs);
      } catch (err) {
        console.error("Failed to initialize MediaRecorder cycle:", err);
      }
    };
  }, [chunkDurationMs]);

  // Trigger cycle start / stop when isCapturing or stream changes
  useEffect(() => {
    if (isCapturing && stream) {
      startCycleRef.current();
    } else {
      stopAllRecording();
    }

    return () => {
      stopAllRecording();
    };
  }, [isCapturing, stream, stopAllRecording]);

  // Derived chunk status: idle when not capturing, cycleStatus when capturing
  const chunkStatus: ChunkStatus = !isCapturing ? "idle" : cycleStatus;

  return {
    chunkStatus,
    totalCycles,
    speechChunksCount,
    discardedChunksCount,
    lastChunkInfo,
    activeMimeType,
  };
}
