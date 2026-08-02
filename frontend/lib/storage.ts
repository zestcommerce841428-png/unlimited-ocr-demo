import type { Mode } from "./api";
import type { TaskKey } from "./constants";

const SETTINGS_KEY = "unlimited-ocr:settings";
const HISTORY_KEY = "unlimited-ocr:history";
const MAX_HISTORY = 8;

export interface SavedSettings {
  mode: Mode;
  taskKey: TaskKey;
  customPrompt: string;
}

export interface HistoryEntry {
  id: string;
  fileNames: string[];
  mode: Mode;
  prompt: string;
  timestamp: number;
  preview: string;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadSettings(): SavedSettings | null {
  if (typeof window === "undefined") return null;
  return safeParse(localStorage.getItem(SETTINGS_KEY), null);
}

export function saveSettings(settings: SavedSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse(localStorage.getItem(HISTORY_KEY), []);
}

export function pushHistory(entry: Omit<HistoryEntry, "id" | "timestamp">) {
  if (typeof window === "undefined") return;
  const existing = loadHistory();
  const next: HistoryEntry[] = [
    { ...entry, id: crypto.randomUUID(), timestamp: Date.now() },
    ...existing,
  ].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}
