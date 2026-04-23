import { Link } from "react-router-dom";
import type { RoundBreakdown } from "@/lib/api";
import { fmtInt } from "@/lib/format";

const STAGE_COLOR: Record<string, string> = {
  "Application Review": "#7AA0FF",
  "Round 1": "#5A7EFF",
  "Round 2": "#4F68F0",
  "Round 3": "#8B4DE8",
  "Round 4": "#B85BD9",
  "Final": "#E85BBE",
  "Offer": "#FF6A1A",
};

/** Per-round cells showing how many candidates sit in each stage right now,
 * median days-in-stage, and any stuck-count (days ≥ SLA). Clicking a cell
 * opens /pipeline filtered to that stage. */
export function RoundsStrip({ rounds }: { rounds: RoundBreakdown[] }) {
  if (!rounds?.length) return null;
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-h3">Where candidates are right now</h2>
        <span className="text-caption text-ink-3">count · median days · stuck past SLA</span>
      </div>
      <p className="mt-1 text-small text-ink-3">
        So-what: which round has the most volume and which is holding candidates the longest.
      </p>
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {rounds.map((r) => {
          const color = STAGE_COLOR[r.stage] ?? "#7AA0FF";
          const hasStuck = r.stuck_count > 0;
          return (
            <Link
              key={r.stage}
              to={`/pipeline?stage=${encodeURIComponent(r.stage)}`}
              className={
                "relative rounded-lg border p-3 hover:bg-paper-2 transition-colors " +
                (hasStuck ? "border-brand-orange/60" : "border-hairline")
              }
            >
              <div
                aria-hidden
                className="absolute inset-0 -z-0 opacity-[0.06] rounded-lg"
                style={{ background: color }}
              />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-caption uppercase tracking-wide" style={{ color }}>
                    {r.stage}
                  </div>
                  {hasStuck && (
                    <span className="chip-orange text-caption">{r.stuck_count} stuck</span>
                  )}
                </div>
                <div className="mt-1 font-display text-[22px] leading-[1.05] tnum text-ink">
                  {fmtInt(r.count)}
                </div>
                <div className="text-small text-ink-3 tnum">
                  {r.median_days != null ? `median ${r.median_days}d` : "—"}
                  {r.sla_days != null && <span className="text-ink-3/70"> · SLA {r.sla_days}d</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
