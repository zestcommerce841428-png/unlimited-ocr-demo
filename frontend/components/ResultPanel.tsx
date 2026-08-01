"use client";

import { useState } from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface ResultPanelProps {
  text: string;
  boxes: string[];
  isRunning: boolean;
  error: string | null;
}

type Tab = "rendered" | "raw";

export default function ResultPanel({ text, boxes, isRunning, error }: ResultPanelProps) {
  const [tab, setTab] = useState<Tab>("rendered");
  const [copied, setCopied] = useState(false);
  const [showBoxes, setShowBoxes] = useState(false);

  async function copyText() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const hasContent = text.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-border px-2">
          <div className="flex">
            {(["rendered", "raw"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize",
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-foreground-muted hover:text-foreground"
                )}
              >
                {t === "rendered" ? "Rendered" : "Raw text"}
              </button>
            ))}
          </div>
          {hasContent && (
            <button
              onClick={copyText}
              className="text-xs text-foreground-muted hover:text-primary px-2 py-1"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 min-h-[280px] max-h-[520px] overflow-y-auto">
          {error ? (
            <p className="text-red-500 text-sm">{error}</p>
          ) : !hasContent ? (
            <p className="text-foreground-muted italic text-sm">
              {isRunning ? "Waiting for the model…" : "Results will appear here once you run OCR."}
            </p>
          ) : tab === "rendered" ? (
            <div className="ocr-prose prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {text}
              </ReactMarkdown>
              {isRunning && <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse-dot align-text-bottom ml-0.5" />}
            </div>
          ) : (
            <pre className="text-sm font-mono whitespace-pre-wrap break-words">
              {text}
              {isRunning && <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse-dot align-text-bottom ml-0.5" />}
            </pre>
          )}
        </div>

        {/* Grounding boxes accordion */}
        <div className="border-t border-border">
          <button
            onClick={() => setShowBoxes((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-surface-muted transition-colors"
          >
            <span>🗺️ Layout grounding (detected regions){boxes.length > 1 ? ` — ${boxes.length} pages` : ""}</span>
            <span className={clsx("transition-transform text-xs", showBoxes && "rotate-90")}>▶</span>
          </button>
          {showBoxes && (
            <div className="px-5 pb-5">
              {boxes.length === 0 ? (
                <p className="text-xs text-foreground-muted">No grounding image yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {boxes.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt={`Detected regions, page ${i + 1}`}
                      className="rounded-lg border border-border w-full object-contain"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface-muted p-4 text-sm">
        <div className="font-medium mb-1.5">💡 Tips</div>
        <ul className="list-disc list-inside space-y-1 text-foreground-muted">
          <li>
            <span className="text-foreground font-medium">Gundam</span> mode is fastest for
            single- or dual-column pages.
          </li>
          <li>
            <span className="text-foreground font-medium">Base</span> mode helps on dense
            multi-column layouts or small text.
          </li>
          <li>
            Pick <span className="text-foreground font-medium">Layout grounding</span> as the
            task to see detected regions drawn on the page.
          </li>
          <li>
            PDFs/Office files with more than one resulting page always use multi-page parsing,
            regardless of Mode.
          </li>
        </ul>
      </div>
    </div>
  );
}
