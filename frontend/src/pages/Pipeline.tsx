import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { fmtInt, fmtRelative } from "@/lib/format";

const STAGES = ["Application Review", "Round 1", "Round 2", "Round 3", "Round 4", "Final", "Offer"];

export function Pipeline() {
  const [params, setParams] = useSearchParams();
  const stage = params.get("stage") ?? "";
  const minDays = Number(params.get("min_days") ?? 0);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["pipeline", stage, minDays],
    queryFn: () =>
      api.pipeline({
        stage: stage || undefined,
        min_days: minDays || undefined,
      }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => {
    const all = q.data?.data.residents ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return all;
    return all.filter((r) =>
      [r.candidate_name, r.job_title, r.hiring_manager, r.source_title]
        .some((x) => (x ?? "").toString().toLowerCase().includes(s)),
    );
  }, [q.data, search]);

  const setStage = (next: string) => {
    const n = new URLSearchParams(params);
    if (next) n.set("stage", next);
    else n.delete("stage");
    setParams(n, { replace: true });
  };
  const setMinDays = (n: number) => {
    const p = new URLSearchParams(params);
    if (n > 0) p.set("min_days", String(n));
    else p.delete("min_days");
    setParams(p, { replace: true });
  };

  const rounds = q.data?.data.rounds ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 tracking-tight">Pipeline</h1>
          <p className="mt-1 text-body text-ink-3">
            Every active candidate on a listed + open role, with time in their current stage.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="h-9 rounded-md border border-hairline bg-paper px-3 text-body placeholder:text-ink-3"
            placeholder="Search candidate, role, HM"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-hairline bg-paper px-2 text-body"
            value={minDays}
            onChange={(e) => setMinDays(Number(e.target.value))}
          >
            <option value={0}>All durations</option>
            <option value={3}>≥ 3 days</option>
            <option value={5}>≥ 5 days</option>
            <option value={10}>≥ 10 days</option>
          </select>
        </div>
      </header>

      {/* stage filter chips */}
      <div className="flex flex-wrap gap-1">
        <ChipBtn active={stage === ""} onClick={() => setStage("")}>
          All stages
          <span className="ml-1 text-ink-3 tnum">{rounds.reduce((s, r) => s + r.count, 0)}</span>
        </ChipBtn>
        {STAGES.map((s) => {
          const r = rounds.find((x) => x.stage === s);
          const n = r?.count ?? 0;
          return (
            <ChipBtn key={s} active={stage === s} onClick={() => setStage(s)}>
              {s}
              <span className="ml-1 text-ink-3 tnum">{n}</span>
            </ChipBtn>
          );
        })}
      </div>

      {/* desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-body">
          <thead className="text-caption text-ink-3 bg-paper-2 sticky top-0">
            <tr className="text-left">
              <th className="py-2 px-4 font-medium">Candidate</th>
              <th className="py-2 px-4 font-medium">Role</th>
              <th className="py-2 px-4 font-medium">Stage</th>
              <th className="py-2 px-4 font-medium num text-right">Days in stage</th>
              <th className="py-2 px-4 font-medium">Entered</th>
              <th className="py-2 px-4 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.application_id} className="border-t border-hairline hover:bg-paper-2">
                <td className="py-2 px-4">
                  <div className="font-medium">{r.candidate_name || r.candidate_id}</div>
                  {r.hiring_manager && (
                    <div className="mt-0.5"><span className="chip-blue">{r.hiring_manager}</span></div>
                  )}
                </td>
                <td className="py-2 px-4">
                  <Link to={`/roles/${r.job_id}`} className="hover:underline">{r.job_title}</Link>
                </td>
                <td className="py-2 px-4"><StageChip stage={r.stage_title} /></td>
                <td className={daysCellClass(r.sla_breach)}>
                  {r.days_in_stage != null ? `${r.days_in_stage.toFixed(1)}d` : "—"}
                </td>
                <td className="py-2 px-4 text-ink-2 text-caption">{fmtRelative(r.entered_stage_at)}</td>
                <td className="py-2 px-4 text-ink-2">{r.source_title === "nan" ? "—" : r.source_title}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-ink-3">
                  {q.isLoading ? "Loading…" : "No candidates match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <div key={r.application_id} className={"card p-3 " + (r.sla_breach ? "border-brand-orange/40" : "")}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{r.candidate_name}</div>
                <Link to={`/roles/${r.job_id}`} className="text-small text-ink-2 hover:underline">
                  {r.job_title}
                </Link>
                {r.hiring_manager && (
                  <div className="mt-0.5"><span className="chip-blue">{r.hiring_manager}</span></div>
                )}
              </div>
              <StageChip stage={r.stage_title} />
            </div>
            <div className="mt-1 flex items-center justify-between text-caption text-ink-3">
              <span>Entered {fmtRelative(r.entered_stage_at)}</span>
              <span className={(r.sla_breach ? "text-brand-orange-ink font-medium " : "") + "tnum"}>
                {r.days_in_stage != null ? `${r.days_in_stage.toFixed(1)}d` : "—"} in stage
              </span>
            </div>
          </div>
        ))}
        {!rows.length && (
          <div className="text-small text-ink-3 py-4 text-center">
            {q.isLoading ? "Loading…" : "No candidates match."}
          </div>
        )}
      </div>

      <p className="text-caption text-ink-3">
        Showing {fmtInt(rows.length)} of {fmtInt(q.data?.data.residents.length ?? 0)} active candidates.
      </p>
    </div>
  );
}

function ChipBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "h-8 rounded-full px-3 text-small border transition-colors " +
        (active
          ? "bg-ink text-paper border-ink"
          : "bg-paper text-ink-2 border-hairline hover:bg-paper-2")
      }
    >
      {children}
    </button>
  );
}

function StageChip({ stage }: { stage: string }) {
  const cls: Record<string, string> = {
    "Application Review": "chip-gray",
    "Round 1": "chip-blue",
    "Round 2": "chip-blue",
    "Round 3": "chip-blue",
    "Round 4": "chip-blue",
    "Final": "chip-blue",
    "Offer": "chip-orange",
  };
  return <span className={cls[stage] ?? "chip-gray"}>{stage}</span>;
}

function daysCellClass(breach: boolean): string {
  return "py-2 px-4 text-right num tabular-nums " + (breach ? "text-brand-orange-ink font-medium" : "");
}
