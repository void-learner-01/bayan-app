import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

// 1. Groq Whisper model constant
export const WHISPER_MODEL = "whisper-large-v3-turbo";

// 2. Strict bilingual transcription prompt for classroom lectures
export const TRANSCRIPTION_PROMPT = 
  "You are an accurate, real-time speech-to-text engine for a classroom lecture. " +
  "Transcribe the speech in this audio chunk into text following these strict rules:\n" +
  "1. Language Fidelity:\n" +
  "   - If spoken in Urdu, write in Urdu script.\n" +
  "   - If spoken in English, write in English.\n" +
  "   - If code-mixed (Urdu & English spoken together), preserve both languages exactly as spoken.\n" +
  "2. DO NOT translate anything into another language. Keep each word in its spoken language.\n" +
  "3. If the audio is silent, unclear, background noise only, or there is no intelligible speech, return an empty string '' without adding anything.\n" +
  "4. DO NOT add any commentary, notes, timestamps, explanations, or quotes. Output ONLY the raw transcribed text.\n" +
  "5. Punctuation: Delimit complete sentences or utterances with proper punctuation (Urdu khatma '۔' or question mark '؟' for Urdu, and periods '.' or question marks '?' for English).";

export async function POST(req: NextRequest) {
  try {
    // 3. Security: Read key strictly from server environment
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Groq API key is missing on the server. Please check environment variables.",
          code: "AUTH_ERROR",
        },
        { status: 401 }
      );
    }

    // 4. Initialize Groq SDK Client
    const groq = new Groq({ apiKey });

    // 5. In-Memory Audio Extraction & File Object Preparation
    let audioFile: File | Blob | null = null;
    let fileName = "speech.webm";
    let mimeType = "audio/webm";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const extractedFile = (formData.get("audio") || formData.get("file")) as File | Blob | null;

      if (!extractedFile) {
        return NextResponse.json(
          {
            error: "No audio file provided in form-data field 'audio' or 'file'",
            code: "MISSING_AUDIO",
          },
          { status: 400 }
        );
      }

      audioFile = extractedFile;
    } else if (contentType.includes("audio/")) {
      mimeType = contentType.split(";")[0].trim() || "audio/webm";
      const arrayBuffer = await req.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        audioFile = new File([arrayBuffer], fileName, { type: mimeType });
      }
    } else {
      const arrayBuffer = await req.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        audioFile = new File([arrayBuffer], fileName, { type: "audio/webm" });
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

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json(
        {
          error: "Audio payload is empty",
          code: "EMPTY_AUDIO",
        },
        { status: 400 }
      );
    }

    // 6. Invoke High-Speed Groq Whisper API
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: WHISPER_MODEL,
      prompt: TRANSCRIPTION_PROMPT,
      response_format: "json",
      temperature: 0.0, // Best accuracy & speed without hallucination
    });

    const transcriptText = (transcription.text || "").trim();

    return NextResponse.json({
      text: transcriptText,
      status: "success",
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string; code?: string };
    const errMsg = err?.message || "Transcription failed";

    // Rate Limit / Auth check
    const isRateLimit = err?.status === 429 || errMsg.includes("429") || errMsg.includes("quota");
    const isAuthError = err?.status === 401 || err?.status === 403 || errMsg.includes("API key");

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