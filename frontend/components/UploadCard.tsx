"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import type { Mode } from "@/lib/api";
import { MODES, TASK_PRESETS, EXAMPLES, MAX_DEMO_PAGES, SUPPORTED_EXTENSIONS, type TaskKey } from "@/lib/constants";

interface UploadCardProps {
  isRunning: boolean;
  onRun: (file: File, mode: Mode, prompt: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function UploadCard({ isRunning, onRun }: UploadCardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<Mode>("gundam");
  const [taskKey, setTaskKey] = useState<TaskKey>("document_parsing");
  const [customPrompt, setCustomPrompt] = useState("");
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    setFile(f);
    setPreviewUrl(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  }

  async function pickExample(src: string, name: string, exMode: Mode, exTask: TaskKey) {
    const res = await fetch(src);
    const blob = await res.blob();
    const exFile = new File([blob], name, { type: blob.type });
    pickFile(exFile);
    setMode(exMode);
    setTaskKey(exTask);
    setCustomPrompt("");
  }

  function handleRun() {
    if (!file || isRunning) return;
    const prompt = customPrompt.trim() || TASK_PRESETS.find((t) => t.key === taskKey)!.prompt;
    onRun(file, mode, prompt);
  }

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
          const f = e.dataTransfer.files?.[0];
          if (f) pickFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={clsx(
          "rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors min-h-[180px] flex flex-col items-center justify-center gap-2",
          dragging ? "border-primary bg-surface-muted" : "border-border hover:border-primary/60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={SUPPORTED_EXTENSIONS.join(",")}
          onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="max-h-40 rounded-lg object-contain" />
        ) : (
          <span className="text-3xl" aria-hidden>
            📄
          </span>
        )}
        {file ? (
          <div className="text-sm">
            <div className="font-medium">{file.name}</div>
            <div className="text-foreground-muted">{formatSize(file.size)}</div>
          </div>
        ) : (
          <div className="text-sm">
            <div className="font-medium">Drop a file here, or click to upload</div>
            <div className="text-foreground-muted mt-1">
              Images, PDF, or Office documents (Word/PowerPoint/Excel/text)
            </div>
          </div>
        )}
      </div>

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
              onClick={() => setMode(m.key)}
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
          onChange={(e) => setTaskKey(e.target.value as TaskKey)}
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
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="e.g. Extract the table as markdown."
            rows={2}
            className="mt-2 w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        )}
      </div>

      <button
        type="button"
        onClick={handleRun}
        disabled={!file || isRunning}
        className="w-full rounded-lg bg-primary text-primary-foreground font-semibold py-2.5 text-sm hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isRunning ? (
          <>
            <span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse-dot" />
            Running…
          </>
        ) : (
          <>▶ Run OCR</>
        )}
      </button>

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

      <p className="text-xs text-foreground-muted">
        PDFs and Office documents are parsed page-by-page, capped at the first{" "}
        {MAX_DEMO_PAGES} pages to keep runs inside a shared ZeroGPU quota.
      </p>
    </div>
  );
}
