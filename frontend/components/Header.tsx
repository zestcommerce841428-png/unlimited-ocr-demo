"use client";

import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/api";
import ThemeToggle from "./ThemeToggle";

const MODEL_URL = "https://huggingface.co/baidu/Unlimited-OCR";

const BADGES = [
  { label: "🤗 Model card", href: MODEL_URL },
  { label: "⚙️ GitHub", href: "https://github.com/baidu/Unlimited-OCR" },
  { label: "📄 Paper", href: "https://arxiv.org/abs/2606.23050" },
  { label: "⚖️ MIT License", href: `${MODEL_URL}/blob/main/LICENSE` },
];

export default function Header() {
  const [healthy, setHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth().then(setHealthy);
  }, []);

  return (
    <header className="relative text-center pt-10 pb-6 px-4">
      <div className="absolute top-3 right-4 flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 text-xs text-foreground-muted"
          title={healthy === null ? "Checking API…" : healthy ? "API is online" : "API is unreachable"}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              healthy === null ? "bg-foreground-muted" : healthy ? "bg-green-500" : "bg-red-500"
            }`}
            aria-hidden
          />
          <span className="hidden sm:inline">{healthy === null ? "Checking…" : healthy ? "Online" : "Offline"}</span>
        </span>
        <ThemeToggle />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center justify-center gap-2">
        <span aria-hidden>🔎</span> Unlimited-OCR
      </h1>
      <p className="mt-2 text-foreground-muted text-base sm:text-lg">
        One-shot, long-horizon document parsing — powered by{" "}
        <a
          href={MODEL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:text-primary-hover underline underline-offset-2"
        >
          baidu/Unlimited-OCR
        </a>
      </p>
      <nav className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Project links">
        {BADGES.map((b) => (
          <a
            key={b.label}
            href={b.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-sm font-medium text-foreground hover:bg-surface hover:border-primary transition-colors"
          >
            {b.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
