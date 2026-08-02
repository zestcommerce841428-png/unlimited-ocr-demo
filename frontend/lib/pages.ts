export interface PageResult {
  index: number;
  text: string;
  box?: string;
}

/**
 * Unlimited-OCR's multi-page output separates pages with a literal `<PAGE>`
 * marker. Splits on it and zips each page's text with its grounding-box
 * image (same index) when available.
 */
export function splitIntoPages(text: string, boxes: string[]): PageResult[] {
  if (!text.includes("<PAGE>")) {
    return [{ index: 0, text, box: boxes[0] }];
  }
  const parts = text
    .split("<PAGE>")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.map((pageText, i) => ({ index: i, text: pageText, box: boxes[i] }));
}
