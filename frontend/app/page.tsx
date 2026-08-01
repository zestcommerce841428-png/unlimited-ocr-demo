"use client";

import { useCallback, useRef, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UploadCard from "@/components/UploadCard";
import ResultPanel from "@/components/ResultPanel";
import { runDocument, type Mode } from "@/lib/api";
import { MAX_DEMO_PAGES } from "@/lib/constants";

export default function Home() {
  const [text, setText] = useState("");
  const [boxes, setBoxes] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleRun = useCallback(async (file: File, mode: Mode, prompt: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    setError(null);
    setText("");
    setBoxes([]);

    try {
      const result = await runDocument(
        file,
        mode,
        prompt,
        (chunk) => {
          setText(chunk.text);
          if (chunk.boxes.length) setBoxes(chunk.boxes);
        },
        controller.signal
      );
      setText(result.text);
      if (result.boxes.length) setBoxes(result.boxes);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setIsRunning(false);
    }
  }, []);

  return (
    <div className="flex flex-col min-h-full">
      <Header />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pb-12">
        <p className="text-sm text-foreground-muted text-center mb-6 max-w-2xl mx-auto">
          Upload an <strong className="text-foreground">image</strong> (JPG/PNG/WEBP/BMP/TIFF/GIF),
          a <strong className="text-foreground">PDF</strong>, or an{" "}
          <strong className="text-foreground">Office document</strong> (Word/PowerPoint/Excel/
          text/RTF/CSV) — Office files and PDFs are parsed page-by-page, capped at the first{" "}
          {MAX_DEMO_PAGES} pages to keep runs inside a shared ZeroGPU quota.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5">
            <UploadCard isRunning={isRunning} onRun={handleRun} />
          </div>
          <div className="lg:col-span-7">
            <ResultPanel text={text} boxes={boxes} isRunning={isRunning} error={error} />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
