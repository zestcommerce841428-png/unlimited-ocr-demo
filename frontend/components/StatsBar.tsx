import type { RunStats } from "@/lib/api";

interface StatsBarProps {
  stats: RunStats;
  pageCount: number;
  isRunning: boolean;
}

export default function StatsBar({ stats, pageCount, isRunning }: StatsBarProps) {
  if (!isRunning && stats.chars === 0) return null;

  const items = [
    { label: "Elapsed", value: `${stats.elapsed.toFixed(1)}s` },
    { label: "Chars", value: stats.chars.toLocaleString() },
    ...(stats.avg_tps > 0 ? [{ label: "Speed", value: `${stats.avg_tps.toFixed(1)} tok/s` }] : []),
    ...(pageCount > 1 ? [{ label: "Pages", value: String(pageCount) }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-2 text-xs text-foreground-muted border-t border-border bg-surface-muted/50">
      {items.map((item) => (
        <span key={item.label}>
          <span className="font-medium text-foreground">{item.value}</span> {item.label}
        </span>
      ))}
      {isRunning && (
        <span className="inline-flex items-center gap-1 text-primary">
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-dot" />
          streaming
        </span>
      )}
    </div>
  );
}
