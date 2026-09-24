import { state } from "../state";
import { showActivity } from "../collab/presence";

let activeRecorder: MediaRecorder | null = null;
let activeStream: MediaStream | null = null;
let recordedChunks: Blob[] = [];
let pendingResolver: ((res: { text: string; provider: string }) => void) | null = null;
let pendingRejecter: ((err: Error) => void) | null = null;
let currentMimeType = "audio/webm";

export function isRecordingVoice(): boolean {
  return activeRecorder !== null && activeRecorder.state === "recording";
}

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/wav",
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Transcribe an audio Blob via Lasso Server /api/v1/transcribe (or bridge fallback)
 */
export async function transcribeAudioBlob(
  blob: Blob,
  mimeType: string
): Promise<{ text: string; provider: string }> {
  const base64 = await blobToBase64(blob);

  // Strategy 1: Try CLI bridge if connected
  if (state.bridgeSocket?.readyState === WebSocket.OPEN) {
    try {
      const result = await new Promise<{ text: string; provider: string }>(
        (resolve, reject) => {
          const requestId = `transcribe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error("Transcription timed out via local bridge"));
          }, 25000);

          const handler = (event: MessageEvent) => {
            try {
              const msg = JSON.parse(event.data as string);
              if (msg.type === "transcribe_result" && msg.requestId === requestId) {
                cleanup();
                if (msg.success) {
                  resolve({ text: msg.text || "", provider: msg.provider || "gradium" });
                } else {
                  reject(new Error(msg.error || "Transcription failed"));
                }
              }
            } catch {}
          };

          const cleanup = () => {
            window.clearTimeout(timeout);
            state.bridgeSocket?.removeEventListener("message", handler);
          };

          state.bridgeSocket?.addEventListener("message", handler);
          state.bridgeSocket?.send(
            JSON.stringify({
              type: "transcribe",
              requestId,
              audio: base64,
              mimeType,
              language: "en",
            })
          );
        }
      );
      return result;
    } catch (bridgeErr) {
      console.warn("[transcribe] Bridge transcription failed, falling back to direct server fetch:", bridgeErr);
    }
  }

  // Strategy 2: Direct HTTP fetch to server transcribe endpoint
  const candidateUrls = [
    "http://localhost:3005/api/v1/transcribe",
    "/api/v1/transcribe",
    "https://api.lasso.byorello.space/api/v1/transcribe",
  ];

  let lastError = new Error("Failed to contact transcription service");

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          audio: base64,
          mimeType,
          language: "en",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return {
            text: data.text || "",
            provider: data.provider || "gradium",
          };
        }
        throw new Error(data.message || "Transcription failed");
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * Start recording audio from the user's microphone
 */
export async function startVoiceRecording(): Promise<void> {
  if (isRecordingVoice()) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeStream = stream;
    currentMimeType = getSupportedMimeType() || "audio/webm";

    const recorder = new MediaRecorder(
      stream,
      currentMimeType ? { mimeType: currentMimeType } : undefined
    );
    activeRecorder = recorder;
    recordedChunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const audioBlob = new Blob(recordedChunks, { type: currentMimeType });
      // Stop media tracks
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
        activeStream = null;
      }
      activeRecorder = null;

      if (!pendingResolver) return;

      try {
        const result = await transcribeAudioBlob(audioBlob, currentMimeType);
        pendingResolver(result);
      } catch (err: any) {
        if (pendingRejecter) pendingRejecter(err);
      } finally {
        pendingResolver = null;
        pendingRejecter = null;
      }
    };

    recorder.start(200);
  } catch (err: any) {
    activeStream = null;
    activeRecorder = null;
    throw new Error(err?.message || "Microphone access denied or unavailable");
  }
}

/**
 * Stop recording and return transcription result
 */
export function stopVoiceRecording(): Promise<{ text: string; provider: string }> {
  return new Promise((resolve, reject) => {
    if (!activeRecorder || activeRecorder.state !== "recording") {
      reject(new Error("No active voice recording"));
      return;
    }

    pendingResolver = resolve;
    pendingRejecter = reject;
    activeRecorder.stop();
  });
}

/**
 * Cancel recording without transcribing
 */
export function cancelVoiceRecording(): void {
  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
  if (activeRecorder) {
    activeRecorder.ondataavailable = null;
    activeRecorder.onstop = null;
    try {
      activeRecorder.stop();
    } catch {}
    activeRecorder = null;
  }
  recordedChunks = [];
  if (pendingRejecter) {
    pendingRejecter(new Error("Recording cancelled"));
  }
  pendingResolver = null;
  pendingRejecter = null;
}
