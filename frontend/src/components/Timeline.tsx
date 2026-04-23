import { useMemo } from "react";
import type { RoleTimeline } from "@/lib/api";
import { fmtDate } from "@/lib/format";

const STAGE_COLOR: Record<string, string> = {
  "Application Review": "#7AA0FF",
  "Round 1": "#5A7EFF",
  "Round 2": "#4F68F0",
  "Round 3": "#8B4DE8",
  "Round 4": "#B85BD9",
  "Final": "#E85BBE",
  "Offer": "#FF6A1A",
  "Hired": "#16A34A",
  "Archived": "#6B6B72",
};

type Candidate = RoleTimeline["candidates"][number];

export function TimelineList({ candidates }: { candidates: Candidate[] }) {
  const { globalStart, globalEnd } = useMemo(() => {
    let s = Number.POSITIVE_INFINITY;
    let e = Number.NEGATIVE_INFINITY;
    for (const c of candidates) {
      for (const stage of c.stages) {
        if (stage.entered_at) s = Math.min(s, new Date(stage.entered_at).getTime());
        if (stage.left_at) e = Math.max(e, new Date(stage.left_at).getTime());
        else if (stage.is_current) e = Math.max(e, Date.now());
      }
    }
    if (!Number.isFinite(s) || !Number.isFinite(e) || e === s) {
      const now = Date.now();
      return { globalStart: now - 30 * 86400_000, globalEnd: now };
    }
    return { globalStart: s, globalEnd: e };
  }, [candidates]);

  const range = Math.max(1, globalEnd - globalStart);

  if (!candidates.length) {
    return (
      <div className="text-small text-ink-3 py-6 text-center">
        No stage history on record for this role yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* date scale */}
      <div className="flex justify-between text-caption text-ink-3 tnum">
        <span>{fmtDate(new Date(globalStart).toISOString())}</span>
        <span>{fmtDate(new Date(globalEnd).toISOString())}</span>
      </div>
      <ul className="space-y-2">
        {candidates.map((c) => (
          <li key={c.application_id} className="rounded-lg border border-hairline p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-body">{c.candidate_name}</div>
                <div className="text-caption text-ink-3">
                  now: <span className="text-ink-2">{c.current_stage}</span>
                </div>
              </div>
              <span className="text-caption text-ink-3">
                {c.stages.length} stage{c.stages.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-2 h-6 relative rounded-sm bg-paper-2 overflow-hidden">
              {c.stages.map((stage) => {
                const entered = stage.entered_at ? new Date(stage.entered_at).getTime() : null;
                const left = stage.left_at
                  ? new Date(stage.left_at).getTime()
                  : stage.is_current
                  ? Date.now()
                  : null;
                if (entered == null || left == null) return null;
                const startPct = Math.max(0, ((entered - globalStart) / range) * 100);
                const widthPct = Math.max(1.5, ((left - entered) / range) * 100);
                const color = STAGE_COLOR[stage.stage] ?? "#6B6B72";
                return (
                  <div
                    key={stage.entered_at ?? stage.stage + startPct}
                    className="absolute top-0 bottom-0 group"
                    style={{ left: `${startPct}%`, width: `${widthPct}%`, background: color, opacity: stage.is_current ? 1 : 0.8 }}
                    title={`${stage.stage} · ${stage.duration_days != null ? stage.duration_days + "d" : "ongoing"} · entered ${fmtDate(stage.entered_at)}`}
                  />
                );
              })}
            </div>
            {/* tiny legend of stages traversed */}
            <div className="mt-2 flex flex-wrap gap-2 text-caption text-ink-2">
              {c.stages.map((stage) => (
                <span key={stage.stage + (stage.entered_at ?? "")} className="inline-flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: STAGE_COLOR[stage.stage] ?? "#6B6B72" }}
                  />
                  {stage.stage}
                  <span className="text-ink-3 tnum">
                    {stage.duration_days != null ? ` ${stage.duration_days}d` : stage.is_current ? " (current)" : ""}
                  </span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
