import { Client, handle_file } from "@gradio/client";

export type Mode = "gundam" | "base";

export interface RunStats {
  tokens: number;
  recent_tps: number;
  avg_tps: number;
  elapsed: number;
  chars: number;
}

export interface RunDocumentResult {
  text: string;
  rawText: string;
  boxes: string[];
  stats: RunStats;
  pageCount: number;
}

const EMPTY_STATS: RunStats = { tokens: 0, recent_tps: 0, avg_tps: 0, elapsed: 0, chars: 0 };
const EMPTY_RESULT: RunDocumentResult = { text: "", rawText: "", boxes: [], stats: EMPTY_STATS, pageCount: 0 };

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

interface RawPayload {
  text?: string;
  raw_text?: string;
  boxes?: string[];
  stats?: Partial<RunStats>;
  page_count?: number;
}

function normalize(payload: RawPayload | undefined): RunDocumentResult {
  if (!payload) return EMPTY_RESULT;
  return {
    text: payload.text ?? "",
    rawText: payload.raw_text ?? payload.text ?? "",
    boxes: payload.boxes ?? [],
    stats: { ...EMPTY_STATS, ...payload.stats },
    pageCount: payload.page_count ?? 0,
  };
}

/**
 * Streams OCR results for one or more uploaded documents (multiple files are
 * combined into a single multi-page document server-side). Calls `onChunk`
 * with the accumulated result as it arrives.
 */
export async function runDocument(
  files: File[],
  mode: Mode,
  prompt: string,
  onChunk: (result: RunDocumentResult) => void,
  signal?: AbortSignal
): Promise<RunDocumentResult> {
  const client = await getClient();

  const submission = client.submit("/run_document", {
    documents: files.map((f) => handle_file(f)),
    mode,
    prompt,
  });

  let last = EMPTY_RESULT;

  for await (const msg of submission) {
    if (signal?.aborted) {
      submission.cancel();
      throw new DOMException("Aborted", "AbortError");
    }
    if (msg.type === "data") {
      const payload = (msg.data as unknown[])?.[0] as RawPayload | undefined;
      last = normalize(payload);
      onChunk(last);
    }
    if (msg.type === "status" && (msg.stage === "complete" || msg.stage === "error")) {
      if (msg.stage === "error") {
        throw new Error(typeof msg.message === "string" ? msg.message : "Inference failed.");
      }
      break;
    }
  }

  return last;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
