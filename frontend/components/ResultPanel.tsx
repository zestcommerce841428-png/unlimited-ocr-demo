"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { RunStats } from "@/lib/api";
import { parseGroundingRegions, stripGroundingTokens } from "@/lib/grounding";
import { splitIntoPages } from "@/lib/pages";
import type { ExportMeta } from "@/lib/export";
import GroundingOverlay from "./GroundingOverlay";
import ExportMenu from "./ExportMenu";
import StatsBar from "./StatsBar";
import Lightbox from "./Lightbox";

interface ResultPanelProps {
  files: File[];
  text: string;
  rawText: string;
  boxes: string[];
  stats: RunStats;
  pageCount: number;
  isRunning: boolean;
  error: string | null;
  isEdited: boolean;
  onEditedTextChange: (text: string) => void;
  meta: ExportMeta;
}

type Tab = "rendered" | "raw" | "pages";

export default function ResultPanel({
  files,
  text,
  rawText,
  boxes,
  stats,
  pageCount,
  isRunning,
  error,
  isEdited,
  onEditedTextChange,
  meta,
}: ResultPanelProps) {
  const [tab, setTab] = useState<Tab>("rendered");
  const [copied, setCopied] = useState(false);
  const [showBoxes, setShowBoxes] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [activePage, setActivePage] = useState(0);

  const hasContent = text.trim().length > 0;
  const regions = useMemo(() => parseGroundingRegions(rawText), [rawText]);
  // Defensive strip of literal <|ref|>/<|det|> tokens for the polished views
  // — "Raw text" keeps the true backend value. See stripGroundingTokens().
  const cleanText = useMemo(() => stripGroundingTokens(text), [text]);
  const pages = useMemo(() => splitIntoPages(cleanText, boxes), [cleanText, boxes]);
  const isMultiPage = pageCount > 1 || pages.length > 1;

  // One object URL per image file, created only when `files` changes and
  // revoked on cleanup — creating these inline in render would leak a new
  // blob URL on every streaming update.
  const previewUrls = useMemo(
    () => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)),
    [files]
  );
  useEffect(() => {
    return () => previewUrls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [previewUrls]);
  const previewUrl = previewUrls[0] ?? null;

  async function copyText() {
    await navigator.clipboard.writeText(tab === "raw" ? text : cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "rendered", label: "Rendered" },
    { key: "raw", label: "Raw text" },
    ...(isMultiPage ? [{ key: "pages" as Tab, label: `Pages (${pages.length})` }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Original document preview */}
      {files.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {files.map((f, i) => {
            const url = previewUrls[i];
            return (
              <button
                key={i}
                onClick={() => url && setLightbox({ src: url, alt: f.name })}
                className="shrink-0 flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs hover:border-primary/60 transition-colors"
                disabled={!url}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <span className="w-8 h-8 rounded bg-surface-muted flex items-center justify-center">📄</span>
                )}
                <span className="max-w-[8rem] truncate">{f.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-border px-2">
          <div className="flex">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-foreground-muted hover:text-foreground"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {hasContent && (
            <div className="flex items-center gap-1">
              {isEdited && (
                <span className="text-xs text-amber-600 dark:text-amber-400 px-1.5" title="Manually edited">
                  edited
                </span>
              )}
              {tab === "raw" && (
                <button
                  onClick={() => setEditing((v) => !v)}
                  className="text-xs text-foreground-muted hover:text-primary px-2 py-1"
                >
                  {editing ? "Done" : "Edit"}
                </button>
              )}
              <button onClick={copyText} className="text-xs text-foreground-muted hover:text-primary px-2 py-1">
                {copied ? "Copied!" : "Copy"}
              </button>
              <ExportMenu text={cleanText} rawText={rawText} meta={meta} />
            </div>
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
                {cleanText}
              </ReactMarkdown>
              {isRunning && (
                <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse-dot align-text-bottom ml-0.5" />
              )}
            </div>
          ) : tab === "raw" ? (
            editing ? (
              <textarea
                value={text}
                onChange={(e) => onEditedTextChange(e.target.value)}
                rows={16}
                className="w-full text-sm font-mono bg-surface-muted rounded-lg p-3 border border-border focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            ) : (
              <pre className="text-sm font-mono whitespace-pre-wrap break-words">
                {text}
                {isRunning && (
                  <span className="inline-block w-2 h-4 bg-primary/70 animate-pulse-dot align-text-bottom ml-0.5" />
                )}
              </pre>
            )
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {pages.map((p) => (
                  <button
                    key={p.index}
                    onClick={() => setActivePage(p.index)}
                    className={clsx(
                      "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                      activePage === p.index
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/60"
                    )}
                  >
                    Page {p.index + 1}
                  </button>
                ))}
              </div>
              {pages[activePage]?.box && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pages[activePage].box}
                  alt={`Page ${activePage + 1} detected regions`}
                  className="rounded-lg border border-border w-full max-h-64 object-contain cursor-zoom-in"
                  onClick={() => setLightbox({ src: pages[activePage].box!, alt: `Page ${activePage + 1}` })}
                />
              )}
              <pre className="text-sm font-mono whitespace-pre-wrap break-words">{pages[activePage]?.text}</pre>
            </div>
          )}
        </div>

        {/* Grounding regions */}
        {(regions.length > 0 || boxes.length > 0) && (
          <div className="border-t border-border">
            <button
              onClick={() => setShowBoxes((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium hover:bg-surface-muted transition-colors"
            >
              <span>
                🗺️ Layout grounding {boxes.length > 1 ? `— ${boxes.length} pages` : ""}
                {regions.length > 0 ? ` — ${regions.length} regions` : ""}
              </span>
              <span className={clsx("transition-transform text-xs", showBoxes && "rotate-90")}>▶</span>
            </button>
            {showBoxes && (
              <div className="px-5 pb-5">
                {regions.length > 0 && previewUrl && !isMultiPage ? (
                  <GroundingOverlay imageSrc={previewUrl} regions={regions} />
                ) : boxes.length === 0 ? (
                  <p className="text-xs text-foreground-muted">No grounding image yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {boxes.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt={`Detected regions, page ${i + 1}`}
                        onClick={() => setLightbox({ src, alt: `Detected regions, page ${i + 1}` })}
                        className="rounded-lg border border-border w-full object-contain cursor-zoom-in"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <StatsBar stats={stats} pageCount={pageCount} isRunning={isRunning} />
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
            task for hoverable detected regions.
          </li>
          <li>Select several files at once to combine them into one multi-page document.</li>
          <li>Switch to the Raw text tab to manually correct the output before exporting.</li>
        </ul>
      </div>

      {lightbox && <Lightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />}
    </div>
  );
}
