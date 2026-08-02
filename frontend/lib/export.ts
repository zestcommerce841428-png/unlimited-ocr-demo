import type { GroundingRegion } from "./grounding";

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(text: string, filename = "unlimited-ocr-result.md") {
  downloadBlob(text, filename, "text/markdown;charset=utf-8");
}

export function downloadText(text: string, filename = "unlimited-ocr-result.txt") {
  downloadBlob(text, filename, "text/plain;charset=utf-8");
}

export interface ExportMeta {
  mode: string;
  prompt: string;
  fileNames: string[];
  pageCount: number;
  timestamp: string;
  stats?: unknown;
}

export function downloadJson(
  text: string,
  regions: GroundingRegion[],
  meta: ExportMeta,
  filename = "unlimited-ocr-result.json"
) {
  const payload = { ...meta, text, regions };
  downloadBlob(JSON.stringify(payload, null, 2), filename, "application/json;charset=utf-8");
}

/** Extracts every HTML <table> in the text and converts each to CSV. */
export function extractTablesAsCsv(html: string): string[] {
  if (typeof window === "undefined" || !html.includes("<table")) return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  return tables.map((table) => {
    const rows = Array.from(table.querySelectorAll("tr"));
    return rows
      .map((row) =>
        Array.from(row.querySelectorAll("td, th"))
          .map((cell) => csvEscape(cell.textContent?.trim() ?? ""))
          .join(",")
      )
      .join("\n");
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(csv: string, filename: string) {
  downloadBlob(csv, filename, "text/csv;charset=utf-8");
}
