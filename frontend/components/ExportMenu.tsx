"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  downloadMarkdown,
  downloadText,
  downloadJson,
  downloadCsv,
  extractTablesAsCsv,
  type ExportMeta,
} from "@/lib/export";
import { parseGroundingRegions } from "@/lib/grounding";

interface ExportMenuProps {
  text: string;
  rawText: string;
  meta: ExportMeta;
  disabled?: boolean;
}

export default function ExportMenu({ text, rawText, meta, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const tables = extractTablesAsCsv(text);

  function pick(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="text-xs font-medium text-foreground-muted hover:text-primary px-2 py-1 disabled:opacity-40 disabled:pointer-events-none"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⬇ Export
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-48 rounded-lg border border-border bg-surface shadow-lg py-1 z-20 text-sm"
        >
          <button
            role="menuitem"
            className="w-full text-left px-3 py-1.5 hover:bg-surface-muted"
            onClick={() => pick(() => downloadMarkdown(text))}
          >
            Markdown (.md)
          </button>
          <button
            role="menuitem"
            className="w-full text-left px-3 py-1.5 hover:bg-surface-muted"
            onClick={() => pick(() => downloadText(text))}
          >
            Plain text (.txt)
          </button>
          <button
            role="menuitem"
            className="w-full text-left px-3 py-1.5 hover:bg-surface-muted"
            onClick={() => pick(() => downloadJson(text, parseGroundingRegions(rawText), meta))}
          >
            Structured (.json)
          </button>
          {tables.map((csv, i) => (
            <button
              key={i}
              role="menuitem"
              className={clsx("w-full text-left px-3 py-1.5 hover:bg-surface-muted")}
              onClick={() => pick(() => downloadCsv(csv, `table-${i + 1}.csv`))}
            >
              Table {i + 1} (.csv)
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
