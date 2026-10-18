"use client";

import React, { useMemo } from "react";

// Unicode range for Arabic & Urdu characters
export const URDU_UNICODE_REGEX =
  /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Latin words, numbers, and technical symbols
export const LATIN_RUN_REGEX =
  /([A-Za-z0-9]+(?:['’\-/.][A-Za-z0-9]+)*(?:\s+[A-Za-z0-9]+(?:['’\-/.][A-Za-z0-9]+)*)*)/g;

/**
 * Checks if a string contains any Urdu/Arabic characters
 */
export function isUrduScript(text: string): boolean {
  return URDU_UNICODE_REGEX.test(text);
}

/**
 * Splits a continuous transcript into individual sentence/utterance blocks.
 * Handles explicit newlines, Urdu khatma (۔), Arabic question mark (؟), and standard punctuation (. ? !).
 */
export function splitIntoSentences(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n+/);
  const sentences: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Split by sentence terminators
    const parts = trimmedLine.split(/(?<=[.۔?!؟])\s+/);
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (trimmedPart.length > 0) {
        sentences.push(trimmedPart);
      }
    }
  }

  return sentences.length > 0 ? sentences : [rawText.trim()];
}

interface SegmentToken {
  text: string;
  isUrdu: boolean;
  isLatinRun: boolean;
}

/**
 * Tokenizes a sentence into script runs so that code-mixed words (e.g. English technical
 * terms inside Urdu sentences, or Urdu phrases in English) are isolated via <bdi>
 * preventing bidirectional text flipping, broken punctuation, or scrambled numerals.
 */
export function tokenizeSentence(sentence: string, isBaseUrdu: boolean): SegmentToken[] {
  if (isBaseUrdu) {
    // In Urdu text, identify Latin/English words or numbers and isolate them
    const tokens: SegmentToken[] = [];
    let lastIndex = 0;
    const regex = new RegExp(LATIN_RUN_REGEX);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(sentence)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        tokens.push({
          text: sentence.substring(lastIndex, matchIndex),
          isUrdu: true,
          isLatinRun: false,
        });
      }
      tokens.push({
        text: match[0],
        isUrdu: false,
        isLatinRun: true,
      });
      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < sentence.length) {
      tokens.push({
        text: sentence.substring(lastIndex),
        isUrdu: true,
        isLatinRun: false,
      });
    }

    return tokens.length > 0
      ? tokens
      : [{ text: sentence, isUrdu: true, isLatinRun: false }];
  } else {
    // In English text, identify Urdu words and isolate them
    const tokens: SegmentToken[] = [];
    const urduRunRegex =
      /([\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+(?:\s+[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+)*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = urduRunRegex.exec(sentence)) !== null) {
      const matchIndex = match.index;
      if (matchIndex > lastIndex) {
        tokens.push({
          text: sentence.substring(lastIndex, matchIndex),
          isUrdu: false,
          isLatinRun: false,
        });
      }
      tokens.push({
        text: match[0],
        isUrdu: true,
        isLatinRun: false,
      });
      lastIndex = matchIndex + match[0].length;
    }

    if (lastIndex < sentence.length) {
      tokens.push({
        text: sentence.substring(lastIndex),
        isUrdu: false,
        isLatinRun: false,
      });
    }

    return tokens.length > 0
      ? tokens
      : [{ text: sentence, isUrdu: false, isLatinRun: false }];
  }
}

interface BilingualCaptionProps {
  text: string;
  isInterim?: boolean;
  fontSizeClass?: string;
  showLanguageBadge?: boolean;
}

export function BilingualCaption({
  text,
  isInterim = false,
  fontSizeClass = "text-xl sm:text-2xl",
  showLanguageBadge = false,
}: BilingualCaptionProps) {
  const isUrdu = useMemo(() => isUrduScript(text), [text]);
  const tokens = useMemo(() => tokenizeSentence(text, isUrdu), [text, isUrdu]);

  if (!text || !text.trim()) return null;

  return (
    <div
      dir={isUrdu ? "rtl" : "ltr"}
      lang={isUrdu ? "ur" : "en"}
      className={`group relative rounded-2xl p-4 transition-all duration-200 border ${
        isInterim
          ? "bg-amber-950/20 border-[#FFE600]/40 shadow-[0_0_15px_rgba(255,230,0,0.1)]"
          : "bg-zinc-950/80 hover:bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700/90"
      } ${isUrdu ? "text-right" : "text-left"}`}
    >
      {/* Optional micro language/direction badge */}
      {showLanguageBadge && (
        <div
          className={`flex items-center gap-1.5 mb-2 text-[10px] font-mono uppercase tracking-wider ${
            isUrdu ? "justify-start flex-row-reverse" : "justify-start"
          }`}
        >
          <span
            className={`px-1.5 py-0.5 rounded font-bold border ${
              isUrdu
                ? "bg-[#FFE600]/15 text-[#FFE600] border-[#FFE600]/30"
                : "bg-blue-950/50 text-blue-300 border-blue-800/50"
            }`}
          >
            {isUrdu ? "Urdu • RTL" : "English • LTR"}
          </span>
          {isInterim && (
            <span className="flex items-center gap-1 text-amber-300 font-sans">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFE600] animate-ping" />
              Live Capturing...
            </span>
          )}
        </div>
      )}

      {/* Caption Content with bidirectional tokens */}
      <div
        className={`${fontSizeClass} font-medium tracking-normal select-text transition-all ${
          isUrdu ? "font-urdu text-white" : "font-sans text-zinc-100"
        } ${isInterim ? "text-zinc-300" : ""}`}
        style={
          isUrdu
            ? {
                lineHeight: "2.3",
                wordSpacing: "0.06em",
              }
            : {
                lineHeight: "1.7",
              }
        }
      >
        {tokens.map((token, idx) => {
          if (isUrdu && token.isLatinRun) {
            // English word embedded inside Urdu sentence:
            // Isolate directionally with <bdi> and apply clean sans-serif and high contrast accent
            return (
              <bdi
                key={idx}
                dir="ltr"
                className="font-sans font-semibold text-[#FFE600] mx-1 inline-block px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 align-baseline bidi-isolate"
              >
                {token.text}
              </bdi>
            );
          } else if (!isUrdu && token.isUrdu) {
            // Urdu word embedded inside English sentence:
            // Isolate directionally with <bdi> and apply Noto Nastaliq Urdu
            return (
              <bdi
                key={idx}
                dir="rtl"
                className="font-urdu font-semibold text-[#FFE600] mx-1 inline-block px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 align-baseline bidi-isolate"
              >
                {token.text}
              </bdi>
            );
          }

          // Native script segment
          return <span key={idx}>{token.text}</span>;
        })}

        {isInterim && (
          <span className="inline-block w-2 h-4 ml-1.5 mr-1.5 bg-[#FFE600] animate-pulse align-middle rounded-sm" />
        )}
      </div>
    </div>
  );
}
