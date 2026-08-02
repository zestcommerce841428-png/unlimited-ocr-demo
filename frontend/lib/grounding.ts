export interface GroundingRegion {
  label: string;
  /** [x1, y1, x2, y2], normalized 0-999 per the model's coordinate convention. */
  box: [number, number, number, number];
}

const REGION_RE = /<\|ref\|>([\s\S]*?)<\|\/ref\|><\|det\|>([\s\S]*?)<\|\/det\|>/g;

/**
 * Parses Unlimited-OCR's `<|ref|>label<|/ref|><|det|>[x1,y1,x2,y2]<|/det|>`
 * grounding tokens out of raw model output (only present when using the
 * "Layout grounding" prompt, and only in the raw/unprocessed token stream —
 * the cleaned Markdown result has these stripped).
 */
export function parseGroundingRegions(rawText: string): GroundingRegion[] {
  const regions: GroundingRegion[] = [];
  for (const match of rawText.matchAll(REGION_RE)) {
    const label = match[1].trim();
    let box: number[];
    try {
      box = JSON.parse(match[2].trim());
    } catch {
      continue;
    }
    if (Array.isArray(box) && box.length === 4 && box.every((n) => typeof n === "number")) {
      regions.push({ label, box: box as [number, number, number, number] });
    }
  }
  return regions;
}

/**
 * Strips `<|ref|>...<|det|>[...]<|/det|>` tokens from display text. Whether
 * the model's own cleaned result already omits these for grounding-task
 * output is untested against the real backend, so this is a defensive
 * client-side safety net for the polished (non-"Raw text") views — it's a
 * no-op if the tokens are already gone.
 */
export function stripGroundingTokens(text: string): string {
  return text.replace(REGION_RE, "").replace(/[ \t]+\n/g, "\n").trim();
}

/** Converts a normalized (0-999) box into CSS percentages for absolute positioning. */
export function boxToPercent(box: [number, number, number, number]) {
  const [x1, y1, x2, y2] = box;
  return {
    left: `${(x1 / 999) * 100}%`,
    top: `${(y1 / 999) * 100}%`,
    width: `${((x2 - x1) / 999) * 100}%`,
    height: `${((y2 - y1) / 999) * 100}%`,
  };
}

const REGION_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export function regionColor(index: number): string {
  return REGION_COLORS[index % REGION_COLORS.length];
}
