"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface AudioCaptureState {
  isCapturing: boolean;
  volume: number; // 0 to 100
  isSoundDetected: boolean;
  permissionStatus: "idle" | "requesting" | "granted" | "denied" | "unsupported";
  errorMessage: string | null;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  stream: MediaStream | null;
}

export function useAudioCapture(soundThreshold: number = 8): AudioCaptureState {
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0);
  const [isSoundDetected, setIsSoundDetected] = useState<boolean>(false);
  const [permissionStatus, setPermissionStatus] = useState<
    "idle" | "requesting" | "granted" | "denied" | "unsupported"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const updateVolumeRef = useRef<() => void>(() => {});

  const cleanupAudio = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      try {
        analyserRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      analyserRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setStream(null);
    setIsCapturing(false);
    setVolume(0);
    setIsSoundDetected(false);
  }, []);

  // Update loop logic kept in ref to cleanly break self-referential closure
  useEffect(() => {
    updateVolumeRef.current = () => {
      if (!analyserRef.current) return;

      const analyser = analyserRef.current;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(dataArray);

      // Calculate Root Mean Square (RMS) volume
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128; // -1.0 to 1.0
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);

      // Scale RMS dynamically (speech is usually 0.02 - 0.25 RMS)
      const boosted = Math.min(1, rms * 4.5);
      const computedVolume = Math.min(100, Math.round(boosted * 100));

      setVolume(computedVolume);
      setIsSoundDetected(computedVolume >= soundThreshold);

      animationFrameRef.current = requestAnimationFrame(() => {
        updateVolumeRef.current();
      });
    };
  }, [soundThreshold]);

  const startCapture = useCallback(async () => {
    cleanupAudio();
    setErrorMessage(null);

    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
      setPermissionStatus("unsupported");
      setErrorMessage("Microphone access is not supported by your browser.");
      return;
    }

    setPermissionStatus("requesting");

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      streamRef.current = micStream;
      setStream(micStream);
      setPermissionStatus("granted");

      // Set up Web Audio API
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtxClass();

      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;

      const source = audioCtx.createMediaStreamSource(micStream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      setIsCapturing(true);

      // Start volume animation loop via ref
      animationFrameRef.current = requestAnimationFrame(() => {
        updateVolumeRef.current();
      });
    } catch (err: unknown) {
      cleanupAudio();
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setPermissionStatus("denied");
        setErrorMessage(
          "Microphone permission was denied. Please allow microphone access in your browser settings to continue."
        );
      } else if (err instanceof DOMException && err.name === "NotFoundError") {
        setPermissionStatus("denied");
        setErrorMessage("No microphone found. Please connect a microphone to your device.");
      } else {
        setPermissionStatus("denied");
        const msg = err instanceof Error ? err.message : "Unable to access microphone.";
        setErrorMessage(`Microphone error: ${msg}`);
      }
    }
  }, [cleanupAudio]);

  const stopCapture = useCallback(() => {
    cleanupAudio();
  }, [cleanupAudio]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return {
    isCapturing,
    volume,
    isSoundDetected,
    permissionStatus,
    errorMessage,
    startCapture,
    stopCapture,
    stream,
  };
}
