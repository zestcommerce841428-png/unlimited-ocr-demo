import type { Mode } from "./api";

export const MODES: { key: Mode; label: string; description: string }[] = [
  {
    key: "gundam",
    label: "Gundam",
    description: "Fast — crops the page into tiles",
  },
  {
    key: "base",
    label: "Base",
    description: "Accurate — processes the full page",
  },
];

export const TASK_PRESETS = [
  { key: "document_parsing", label: "Document parsing", prompt: "document parsing." },
  { key: "free_ocr", label: "Free OCR", prompt: "Free OCR." },
  { key: "parse_figure", label: "Parse the figure", prompt: "Parse the figure." },
  {
    key: "layout_grounding",
    label: "Layout grounding",
    prompt: "<|grounding|>Given the layout of the image. ",
  },
] as const;

export type TaskKey = (typeof TASK_PRESETS)[number]["key"];

export const MAX_DEMO_PAGES = 4;
export const MAX_FILE_SIZE_MB = 25;

export const SUPPORTED_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
  ".gif",
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".odt",
  ".odp",
  ".ods",
  ".rtf",
  ".txt",
  ".csv",
];

export const EXAMPLES = [
  {
    src: "/examples/invoice.png",
    name: "invoice.png",
    mode: "gundam" as Mode,
    task: "document_parsing" as TaskKey,
  },
  {
    src: "/examples/report.png",
    name: "report.png",
    mode: "base" as Mode,
    task: "document_parsing" as TaskKey,
  },
  {
    src: "/examples/invoice.png",
    name: "invoice.png",
    mode: "gundam" as Mode,
    task: "layout_grounding" as TaskKey,
  },
];
