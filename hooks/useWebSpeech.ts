"use client";

import { useState, useRef, useEffect, useCallback, useSyncExternalStore } from "react";

// Web Speech API TypeScript definitions
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultWrapper {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultListWrapper {
  length: number;
  [index: number]: SpeechRecognitionResultWrapper;
}

interface SpeechRecognitionEventExtended extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListWrapper;
}

interface SpeechRecognitionErrorEventExtended extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEventExtended) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEventExtended) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export type SupportedLanguage = "ur-PK" | "en-US";

export interface UseWebSpeechOptions {
  lang?: SupportedLanguage;
  onFinalTranscript?: (text: string) => void;
  onFinalPart?: (newPart: string) => void;
}

export function useWebSpeech({
  lang = "ur-PK",
  onFinalTranscript,
  onFinalPart,
}: UseWebSpeechOptions = {}) {
  // Subscribe to browser speech recognition support safely across SSR and Client
  const isSupported = useSyncExternalStore(
    () => () => {},
    () => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    () => false
  );

  const [isListening, setIsListening] = useState<boolean>(false);
  const [finalTranscript, setFinalTranscript] = useState<string>("");
  const [interimTranscript, setInterimTranscript] = useState<string>("");
  const [speechError, setSpeechError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const shouldListenRef = useRef<boolean>(false);
  const currentLangRef = useRef<SupportedLanguage>(lang);
  const onFinalCallbackRef = useRef(onFinalTranscript);
  const onFinalPartRef = useRef(onFinalPart);

  // Keep callback and lang ref up to date
  useEffect(() => {
    onFinalCallbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onFinalPartRef.current = onFinalPart;
  }, [onFinalPart]);

  useEffect(() => {
    currentLangRef.current = lang;
  }, [lang]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    setIsListening(false);
    setInterimTranscript("");

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setSpeechError(
        "Speech Recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge."
      );
      return;
    }

    // Clean previous instance if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore abort error
      }
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = currentLangRef.current;
      recognition.maxAlternatives = 1;

      shouldListenRef.current = true;
      setSpeechError(null);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEventExtended) => {
        let currentInterim = "";
        let newFinalPart = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item && item[0]) {
            const transcriptChunk = item[0].transcript;
            if (item.isFinal) {
              newFinalPart += transcriptChunk + " ";
            } else {
              currentInterim += transcriptChunk;
            }
          }
        }

        if (newFinalPart) {
          const trimmed = newFinalPart.trim();
          if (trimmed && onFinalPartRef.current) {
            onFinalPartRef.current(trimmed);
          }
          setFinalTranscript((prev) => {
            const updated = (prev ? prev + "\n" : "") + trimmed;
            if (onFinalCallbackRef.current) {
              onFinalCallbackRef.current(updated);
            }
            return updated;
          });
        }

        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventExtended) => {
        // "no-speech" and "aborted" are routine browser events, don't show fatal error
        if (event.error === "no-speech") {
          return;
        }
        if (event.error === "aborted") {
          return;
        }

        if (event.error === "not-allowed") {
          setSpeechError("Microphone permission was denied for Speech Recognition.");
          shouldListenRef.current = false;
          setIsListening(false);
          return;
        }

        setSpeechError(`Speech recognition error: ${event.error}`);
      };

      recognition.onend = () => {
        // If user hasn't explicitly stopped, auto-restart to maintain continuous streaming
        if (shouldListenRef.current) {
          try {
            recognition.start();
          } catch {
            // If starting too quickly, queue a slight delay
            setTimeout(() => {
              if (shouldListenRef.current) {
                try {
                  recognition.start();
                } catch {
                  // Ignore restart error
                }
              }
            }, 200);
          }
        } else {
          setIsListening(false);
          setInterimTranscript("");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initialize recognition";
      setSpeechError(msg);
      setIsListening(false);
    }
  }, []);

  // Hot-swap language without stopping the microphone:
  // If listening is ongoing, restart seamlessly with the new language
  const changeLanguage = useCallback(
    (newLang: SupportedLanguage) => {
      currentLangRef.current = newLang;
      if (shouldListenRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore abort
        }
        // Small delay to let abort finish before restarting with new lang
        setTimeout(() => {
          if (shouldListenRef.current) {
            startListening();
          }
        }, 100);
      }
    },
    [startListening]
  );

  const clearTranscript = useCallback(() => {
    setFinalTranscript("");
    setInterimTranscript("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    finalTranscript,
    interimTranscript,
    speechError,
    startListening,
    stopListening,
    changeLanguage,
    clearTranscript,
  };
}
