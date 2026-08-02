"use client";

import { useTheme, type ThemePref } from "@/lib/theme";

const OPTIONS: { key: ThemePref; icon: string; label: string }[] = [
  { key: "light", icon: "☀️", label: "Light theme" },
  { key: "system", icon: "🖥️", label: "System theme" },
  { key: "dark", icon: "🌙", label: "Dark theme" },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex items-center rounded-full border border-border bg-surface-muted p-0.5" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          role="radio"
          aria-checked={theme === opt.key}
          title={opt.label}
          onClick={() => setTheme(opt.key)}
          className={`w-7 h-7 flex items-center justify-center rounded-full text-sm transition-colors ${
            theme === opt.key ? "bg-surface shadow-sm" : "opacity-60 hover:opacity-100"
          }`}
        >
          <span aria-hidden>{opt.icon}</span>
          <span className="sr-only">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
