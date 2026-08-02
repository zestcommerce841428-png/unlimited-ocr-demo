"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UploadCard from "@/components/UploadCard";
import ResultPanel from "@/components/ResultPanel";
import { useOcrRun } from "@/lib/useOcrRun";
import type { Mode } from "@/lib/api";
import { TASK_PRESETS, MAX_DEMO_PAGES, type TaskKey } from "@/lib/constants";
import type { ExportMeta } from "@/lib/export";
import { loadSettings } from "@/lib/storage";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  // Lazy initializers restore the last-used settings without a mount effect
  // (loadSettings() is SSR-safe — returns null when `window` doesn't exist).
  const [mode, setMode] = useState<Mode>(() => loadSettings()?.mode ?? "gundam");
  const [taskKey, setTaskKey] = useState<TaskKey>(() => loadSettings()?.taskKey ?? "document_parsing");
  const [customPrompt, setCustomPrompt] = useState(() => loadSettings()?.customPrompt ?? "");
  const runButtonRef = useRef<HTMLButtonElement>(null);

  const { result, displayText, isEdited, setEditedText, isRunning, error, run, cancel } = useOcrRun();

  const resolvedPrompt = customPrompt.trim() || TASK_PRESETS.find((t) => t.key === taskKey)!.prompt;

  const handleRun = useCallback(() => {
    if (files.length === 0 || isRunning) return;
    run(files, mode, resolvedPrompt);
  }, [files, mode, resolvedPrompt, isRunning, run]);

  // Keyboard shortcuts: Cmd/Ctrl+Enter to run, Esc to cancel a running request.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      } else if (e.key === "Escape" && isRunning) {
        cancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRun, isRunning, cancel]);

  const meta: ExportMeta = {
    mode,
    prompt: resolvedPrompt,
    fileNames: files.map((f) => f.name),
    pageCount: result.pageCount,
    timestamp: new Date().toISOString(),
    stats: result.stats,
  };

  return (
    <div className="flex flex-col min-h-full">
      <Header />
      <main id="main-content" className="flex-1 w-full max-w-5xl mx-auto px-4 pb-12">
        <p className="text-sm text-foreground-muted text-center mb-6 max-w-2xl mx-auto">
          Upload an <strong className="text-foreground">image</strong> (JPG/PNG/WEBP/BMP/TIFF/GIF),
          a <strong className="text-foreground">PDF</strong>, or an{" "}
          <strong className="text-foreground">Office document</strong> — select several files to
          combine them into one document, capped at the first {MAX_DEMO_PAGES} pages to keep runs
          inside a shared ZeroGPU quota.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <UploadCard
              files={files}
              onFilesChange={setFiles}
              mode={mode}
              onModeChange={setMode}
              taskKey={taskKey}
              onTaskKeyChange={setTaskKey}
              customPrompt={customPrompt}
              onCustomPromptChange={setCustomPrompt}
              isRunning={isRunning}
              onRun={handleRun}
              onCancel={cancel}
              runButtonRef={runButtonRef}
            />
          </div>
          <div className="lg:col-span-7">
            <ResultPanel
              files={files}
              text={displayText}
              rawText={result.rawText}
              boxes={result.boxes}
              stats={result.stats}
              pageCount={result.pageCount}
              isRunning={isRunning}
              error={error}
              isEdited={isEdited}
              onEditedTextChange={setEditedText}
              meta={meta}
            />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
