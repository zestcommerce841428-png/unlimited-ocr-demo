"use client";

import { useCallback, useRef, useState } from "react";
import { runDocument, type Mode, type RunDocumentResult } from "./api";
import { pushHistory } from "./storage";
import { useToast } from "./toast";

const EMPTY_RESULT: RunDocumentResult = {
  text: "",
  rawText: "",
  boxes: [],
  stats: { tokens: 0, recent_tps: 0, avg_tps: 0, elapsed: 0, chars: 0 },
  pageCount: 0,
};

export function useOcrRun() {
  const [result, setResult] = useState<RunDocumentResult>(EMPTY_RESULT);
  const [editedText, setEditedText] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { push } = useToast();

  const run = useCallback(
    async (files: File[], mode: Mode, prompt: string) => {
      if (files.length === 0) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsRunning(true);
      setError(null);
      setEditedText(null);
      setResult(EMPTY_RESULT);

      try {
        const final = await runDocument(files, mode, prompt, setResult, controller.signal);
        setResult(final);
        const label = files.length > 1 ? `${files.length} files` : files[0].name;
        push("success", `Parsed ${label} in ${final.stats.elapsed}s`);
        pushHistory({
          fileNames: files.map((f) => f.name),
          mode,
          prompt,
          preview: final.text.slice(0, 140),
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          push("info", "Cancelled.");
        } else {
          const msg = err instanceof Error ? err.message : "Something went wrong.";
          setError(msg);
          push("error", msg);
        }
      } finally {
        setIsRunning(false);
      }
    },
    [push]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    result,
    displayText: editedText ?? result.text,
    isEdited: editedText !== null,
    setEditedText,
    isRunning,
    error,
    run,
    cancel,
  };
}
