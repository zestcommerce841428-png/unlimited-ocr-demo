"use client";

import { useState } from "react";
import clsx from "clsx";
import { boxToPercent, regionColor, type GroundingRegion } from "@/lib/grounding";

interface GroundingOverlayProps {
  imageSrc: string;
  regions: GroundingRegion[];
}

export default function GroundingOverlay({ imageSrc, regions }: GroundingOverlayProps) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
      <div className="sm:col-span-3 relative rounded-lg overflow-hidden border border-border bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSrc} alt="Document with detected regions" className="w-full h-auto block" />
        {regions.map((region, i) => (
          <div
            key={i}
            className={clsx("grounding-region", active === i && "active")}
            style={{ ...boxToPercent(region.box), ["--region-color" as string]: regionColor(i) }}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            title={region.label}
          />
        ))}
      </div>
      <div className="sm:col-span-2 max-h-72 overflow-y-auto rounded-lg border border-border">
        <ul className="divide-y divide-border text-sm">
          {regions.map((region, i) => (
            <li
              key={i}
              className={clsx(
                "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                active === i ? "bg-surface-muted" : "hover:bg-surface-muted/60"
              )}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: regionColor(i) }}
                aria-hidden
              />
              <span className="truncate">{region.label || `region ${i + 1}`}</span>
            </li>
          ))}
          {regions.length === 0 && (
            <li className="px-3 py-2 text-foreground-muted text-xs">No labeled regions detected.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
