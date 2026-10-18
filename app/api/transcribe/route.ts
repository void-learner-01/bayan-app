import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// 1. Model constant (easily configurable)
export const GEMINI_MODEL = "gemini-3.8-flash";

// 2. Strict bilingual transcription prompt without hallucination or translation
export const TRANSCRIPTION_PROMPT = `You are an accurate, real-time speech-to-text engine for a classroom lecture.
Transcribe the speech in this audio chunk into text following these strict rules:
1. Language Fidelity:
   - If spoken in Urdu, write in Urdu script.
   - If spoken in English, write in English.
   - If code-mixed (Urdu & English spoken together), preserve both languages exactly as spoken.
2. DO NOT translate anything into another language. Keep each word in its spoken language.
3. If the audio is silent, unclear, background noise only, or there is no intelligible speech, return an empty string "" without adding anything.
4. DO NOT add any commentary, notes, timestamps, explanations, or quotes. Output ONLY the raw transcribed text.
5. Punctuation: Delimit complete sentences or utterances with proper punctuation (such as Urdu khatma '۔' or question mark '؟' for Urdu, and periods '.' or question marks '?' for English).`;

export async function POST(req: NextRequest) {
  try {
    // 3. Security: Read key strictly from server environment (.env.local)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Gemini API key is missing on the server. Please check .env.local",
          code: "AUTH_ERROR",
        },
        { status: 401 }
      );
    }

    // 4. In-Memory Audio Extraction (Zero disk writes, zero audio logging)
    let audioBuffer: Buffer;
    let mimeType = "audio/webm";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = (formData.get("audio") || formData.get("file")) as File | Blob | null;

      if (!file) {
        return NextResponse.json(
          {
            error: "No audio file provided in form-data field 'audio' or 'file'",
            code: "MISSING_AUDIO",
          },
          { status: 400 }
        );
      }

      mimeType = file.type || "audio/webm";
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else if (contentType.includes("audio/")) {
      mimeType = contentType;
      const arrayBuffer = await req.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      const arrayBuffer = await req.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        audioBuffer = Buffer.from(arrayBuffer);
      } else {
        return NextResponse.json(
          {
            error: "Unsupported content type or empty audio payload",
            code: "INVALID_REQUEST",
          },
          { status: 400 }
        );
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json(
        {
          error: "Audio payload is empty",
          code: "EMPTY_AUDIO",
        },
        { status: 400 }
      );
    }

    // Sanitize MIME type (remove parameter suffixes like ';codecs=opus' for Gemini API compatibility)
    const cleanMimeType = mimeType.split(";")[0].trim() || "audio/webm";

    // 5. Ephemeral base64 encoding for Gemini inlineData
    const base64Audio = audioBuffer.toString("base64");

    // 6. Invoke Gemini API
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: base64Audio,
          },
        },
        {
          text: TRANSCRIPTION_PROMPT,
        },
      ],
    });

    const transcriptText = (response.text || "").trim();

    return NextResponse.json({
      text: transcriptText,
      status: "success",
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string; code?: string };
    const errMsg = err?.message || "Transcription failed";

    // Check for rate limit / quota or auth errors
    const isRateLimit =
      err?.status === 429 ||
      errMsg.includes("429") ||
      errMsg.includes("RESOURCE_EXHAUSTED") ||
      errMsg.includes("quota");

    const isAuthError =
      err?.status === 401 ||
      err?.status === 403 ||
      errMsg.includes("API key not valid") ||
      errMsg.includes("API_KEY_INVALID");

    let statusCode = 500;
    let errorCode = "TRANSCRIPTION_FAILED";

    if (isRateLimit) {
      statusCode = 429;
      errorCode = "QUOTA_EXCEEDED";
    } else if (isAuthError) {
      statusCode = 401;
      errorCode = "AUTH_ERROR";
    }

    return NextResponse.json(
      {
        error: errMsg,
        code: errorCode,
      },
      { status: statusCode }
    );
  }
}
