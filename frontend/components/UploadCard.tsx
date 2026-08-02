"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { Mode } from "@/lib/api";
import {
  MODES,
  TASK_PRESETS,
  EXAMPLES,
  MAX_DEMO_PAGES,
  SUPPORTED_EXTENSIONS,
  MAX_FILE_SIZE_MB,
  type TaskKey,
} from "@/lib/constants";
import { getPdfPageCount } from "@/lib/pdfPreview";
import { loadHistory, saveSettings, type HistoryEntry } from "@/lib/storage";
import { useToast } from "@/lib/toast";

interface UploadCardProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  mode: Mode;
  onModeChange: (m: Mode) => void;
  taskKey: TaskKey;
  onTaskKeyChange: (t: TaskKey) => void;
  customPrompt: string;
  onCustomPromptChange: (p: string) => void;
  isRunning: boolean;
  onRun: () => void;
  onCancel: () => void;
  runButtonRef: React.RefObject<HTMLButtonElement | null>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadCard({
  files,
  onFilesChange,
  mode,
  onModeChange,
  taskKey,
  onTaskKeyChange,
  customPrompt,
  onCustomPromptChange,
  isRunning,
  onRun,
  onCancel,
  runButtonRef,
}: UploadCardProps) {
  const [dragging, setDragging] = useState(false);
  // Lazy initializer: reads the `customPrompt` prop once at mount (page.tsx
  // already restored it from storage via its own lazy initializer) — no
  // effect needed just to decide the toggle's starting state.
  const [showCustomPrompt, setShowCustomPrompt] = useState(() => !!customPrompt);
  // Lazy initializer: loadHistory() is SSR-safe (returns [] server-side).
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [pageCounts, setPageCounts] = useState<Map<File, number>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  useEffect(() => {
    saveSettings({ mode, taskKey, customPrompt });
  }, [mode, taskKey, customPrompt]);

  // Refresh the history list after a run finishes (useOcrRun pushes a new
  // entry to storage on success) — resyncing local state from an external
  // store after an external event, not a synchronous prop→state mirror.
  useEffect(() => {
    if (!isRunning) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncing from localStorage after a run completes; there's no promise/callback to hook this into.
      setHistory(loadHistory());
    }
  }, [isRunning]);

  // Image previews are a pure, synchronous function of `files` (same File
  // object -> same blob URL), so they're derived with useMemo rather than
  // effect+state; the effect below only handles cleanup.
  const previewUrls = useMemo(() => {
    const map = new Map<File, string>();
    files.forEach((f) => {
      if (f.type.startsWith("image/")) map.set(f, URL.createObjectURL(f));
    });
    return map;
  }, [files]);
  useEffect(() => {
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [previewUrls]);

  // PDF page counts are genuinely async (pdf.js has to parse the file), so
  // this one legitimately needs an effect — but it only ever calls setState
  // from inside the .then() callback, never synchronously in the effect body.
  useEffect(() => {
    files.forEach((f) => {
      if (!f.name.toLowerCase().endsWith(".pdf") || pageCounts.has(f)) return;
      getPdfPageCount(f)
        .then((count) => setPageCounts((prev) => new Map(prev).set(f, count)))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  function validateAndAdd(newFiles: File[]) {
    const accepted: File[] = [];
    for (const f of newFiles) {
      const ext = "." + (f.name.split(".").pop() || "").toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        push("error", `${f.name}: unsupported file type (${ext || "unknown"}).`);
        continue;
      }
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        push("error", `${f.name}: exceeds the ${MAX_FILE_SIZE_MB} MB limit.`);
        continue;
      }
      accepted.push(f);
    }
    if (accepted.length) onFilesChange([...files, ...accepted]);
  }

  function removeFile(target: File) {
    // Blob URLs are revoked by the previewUrls cleanup effect once `files`
    // (and therefore the memoized map) changes.
    onFilesChange(files.filter((f) => f !== target));
  }

  function clearAll() {
    onFilesChange([]);
  }

  async function pickExample(src: string, name: string, exMode: Mode, exTask: TaskKey) {
    const res = await fetch(src);
    const blob = await res.blob();
    const exFile = new File([blob], name, { type: blob.type });
    onFilesChange([exFile]);
    onModeChange(exMode);
    onTaskKeyChange(exTask);
    onCustomPromptChange("");
  }

  function loadFromHistory(entry: HistoryEntry) {
    onModeChange(entry.mode);
    const preset = TASK_PRESETS.find((t) => t.prompt === entry.prompt);
    if (preset) {
      onTaskKeyChange(preset.key);
      onCustomPromptChange("");
      setShowCustomPrompt(false);
    } else {
      onCustomPromptChange(entry.prompt);
      setShowCustomPrompt(true);
    }
    push("info", "Settings restored from history — pick a file to run again.");
  }

  const totalPages = files.reduce((sum, f) => sum + (pageCounts.get(f) ?? 1), 0);
  const overCap = totalPages > MAX_DEMO_PAGES;

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm p-5 flex flex-col gap-5">
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          validateAndAdd(Array.from(e.dataTransfer.files ?? []));
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload documents"
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={clsx(
          "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors min-h-[140px] flex flex-col items-center justify-center gap-2",
          dragging ? "border-primary bg-surface-muted" : "border-border hover:border-primary/60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={SUPPORTED_EXTENSIONS.join(",")}
          onChange={(e) => {
            validateAndAdd(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="text-3xl" aria-hidden>
          📄
        </span>
        <div className="text-sm">
          <div className="font-medium">Drop files here, or click to upload</div>
          <div className="text-foreground-muted mt-1">
            Images, PDF, or Office documents — select several to combine into one document
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((f, i) => {
            const previewUrl = previewUrls.get(f);
            const pageCount = pageCounts.get(f);
            return (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded bg-surface-muted flex items-center justify-center shrink-0 text-xs">
                    {f.name.split(".").pop()?.toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">{f.name}</div>
                  <div className="text-xs text-foreground-muted">
                    {formatSize(f.size)}
                    {pageCount ? ` · ${pageCount} page${pageCount > 1 ? "s" : ""}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => removeFile(f)}
                  className="text-foreground-muted hover:text-red-500 shrink-0"
                  aria-label={`Remove ${f.name}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-xs">
            <button onClick={clearAll} className="text-foreground-muted hover:text-primary">
              Clear all
            </button>
            {overCap && (
              <span className="text-amber-600 dark:text-amber-400">
                {totalPages} pages selected — only the first {MAX_DEMO_PAGES} will be used
              </span>
            )}
          </div>
        </div>
      )}

      {/* Mode */}
      <div>
        <div className="text-sm font-medium mb-1">Mode</div>
        <p className="text-xs text-foreground-muted mb-2">
          Applies to single-page results. Gundam crops the page into tiles for speed; Base
          processes the full page for the highest fidelity.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onModeChange(m.key)}
              className={clsx(
                "rounded-lg border px-3 py-2 text-sm text-left transition-colors",
                mode === m.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-muted hover:border-primary/60"
              )}
            >
              <div className="font-semibold">{m.label}</div>
              <div className={clsx("text-xs", mode === m.key ? "opacity-90" : "text-foreground-muted")}>
                {m.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Task */}
      <div>
        <label className="text-sm font-medium mb-1 block" htmlFor="task-select">
          Task
        </label>
        <select
          id="task-select"
          value={taskKey}
          onChange={(e) => onTaskKeyChange(e.target.value as TaskKey)}
          className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {TASK_PRESETS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowCustomPrompt((v) => !v)}
          className="mt-2 text-xs text-primary hover:text-primary-hover"
        >
          {showCustomPrompt ? "− Hide" : "+ Add"} custom prompt (overrides task)
        </button>
        {showCustomPrompt && (
          <textarea
            value={customPrompt}
            onChange={(e) => onCustomPromptChange(e.target.value)}
            placeholder="e.g. Extract the table as markdown."
            rows={2}
            className="mt-2 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        )}
      </div>

      {isRunning ? (
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded-lg border border-red-500/50 text-red-500 font-semibold py-2.5 text-sm hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
        >
          ■ Stop
        </button>
      ) : (
        <button
          ref={runButtonRef}
          type="button"
          onClick={onRun}
          disabled={files.length === 0}
          className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-2.5 text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          title="⌘/Ctrl + Enter"
        >
          ▶ Run OCR
        </button>
      )}

      {/* Examples */}
      <div>
        <div className="text-sm font-medium mb-2">Try an example</div>
        <div className="grid grid-cols-3 gap-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickExample(ex.src, ex.name, ex.mode, ex.task)}
              className="rounded-lg border border-border overflow-hidden hover:border-primary transition-colors"
              title={`${ex.name} — ${ex.mode} / ${ex.task}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ex.src} alt={ex.name} className="w-full h-16 object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Recent</div>
          <ul className="flex flex-col gap-1">
            {history.slice(0, 4).map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => loadFromHistory(entry)}
                  className="w-full text-left text-xs rounded-lg border border-border px-2.5 py-1.5 hover:border-primary/60 transition-colors"
                >
                  <span className="font-medium">{entry.fileNames.join(", ")}</span>
                  <span className="text-foreground-muted"> — {entry.mode}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-foreground-muted">
        PDFs and Office documents are parsed page-by-page, capped at the first {MAX_DEMO_PAGES}{" "}
        pages to keep runs inside a shared ZeroGPU quota. Max {MAX_FILE_SIZE_MB} MB per file.
      </p>
    </div>
  );
}
