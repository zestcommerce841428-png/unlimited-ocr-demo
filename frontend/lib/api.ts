import { Client, handle_file } from "@gradio/client";

export type Mode = "gundam" | "base";

export interface RunDocumentResult {
  text: string;
  boxes: string[];
}

// In production this app is served by the same Python backend it calls, so
// same-origin is correct. In local dev (`npm run dev`), point this at the
// backend's own port via `.env.local`.
const API_BASE =
  process.env.NEXT_PUBLIC_GRADIO_API_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

let clientPromise: ReturnType<typeof Client.connect> | null = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = Client.connect(API_BASE);
  }
  return clientPromise;
}

/**
 * Streams OCR results for an uploaded document. Calls `onChunk` with the
 * accumulated text (and any grounding-box image URLs) as they arrive.
 */
export async function runDocument(
  file: File,
  mode: Mode,
  prompt: string,
  onChunk: (result: RunDocumentResult) => void,
  signal?: AbortSignal
): Promise<RunDocumentResult> {
  const client = await getClient();

  const submission = client.submit("/run_document", {
    document: handle_file(file),
    mode,
    prompt,
  });

  let last: RunDocumentResult = { text: "", boxes: [] };

  for await (const msg of submission) {
    if (signal?.aborted) {
      submission.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
    if (msg.type === "data") {
      const payload = (msg.data as unknown[])?.[0] as
        | { text?: string; boxes?: string[] }
        | undefined;
      if (payload) {
        last = { text: payload.text ?? "", boxes: payload.boxes ?? [] };
        onChunk(last);
      }
    }
    if (msg.type === "status" && (msg.stage === "complete" || msg.stage === "error")) {
      if (msg.stage === "error") {
        throw new Error(
          typeof msg.message === "string" ? msg.message : "Inference failed."
        );
      }
      break;
    }
  }

  return last;
}
