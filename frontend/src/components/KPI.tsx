import type { ReactNode } from "react";
import { fmtInt } from "@/lib/format";

export function KPI({ label, value, caption, tone = "neutral" }: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  tone?: "neutral" | "orange";
}) {
  return (
    <div className={"kpi-card " + (tone === "orange" ? "ring-1 ring-brand-orange/30" : "")}>
      <div className="text-caption uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1 font-display text-[28px] leading-[1.05] text-ink tnum">
        {typeof value === "number" ? fmtInt(value) : value}
      </div>
      {caption && <div className="mt-1 text-small text-ink-3">{caption}</div>}
    </div>
  );
}
