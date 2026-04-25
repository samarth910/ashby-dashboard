import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, type FunnelMatrix } from "@/lib/api";
import { fmtInt } from "@/lib/format";

const STAGE_COLOR: Record<string, string> = {
  "Application Review": "#7AA0FF",
  "Round 1": "#5A7EFF",
  "Round 2": "#4F68F0",
  "Round 3": "#8B4DE8",
  "Round 4": "#B85BD9",
  "Final": "#E85BBE",
  "Offer": "#FF6A1A",
  "Rejected": "#6B6B72",
};

const COL_KEYS = [
  "application_review", "round_1", "round_2", "round_3", "round_4", "final_round", "offer", "rejected",
] as const;

export function Funnel() {
  const q = useQuery({ queryKey: ["funnel"], queryFn: api.funnel, refetchInterval: 60_000 });
  const [search, setSearch] = useState("");

  const filtered = useMemo<FunnelMatrix["groups"]>(() => {
    const groups = q.data?.data.groups ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return groups;
    return groups
      .map((g) => ({ ...g, roles: g.roles.filter((r) => r.title.toLowerCase().includes(s) || (r.hiring_manager ?? "").toLowerCase().includes(s)) }))
      .filter((g) => g.roles.length > 0);
  }, [q.data, search]);

  if (q.isLoading) return <div className="text-ink-3">Loading…</div>;
  if (q.error || !q.data) return <div className="text-ink-3">Failed to load.</div>;
  const d = q.data.data;

  return (
    <div className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 tracking-tight">Per-round funnel</h1>
          <p className="mt-1 text-body text-ink-3">
            Every listed + open role with the exact number of candidates in each stage right now.
            Grouped by team, totals on top.
          </p>
        </div>
        <input
          className="h-9 rounded-md border border-hairline bg-paper px-3 text-body placeholder:text-ink-3 sm:w-72"
          placeholder="Search role or hiring manager"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      <div className="card overflow-x-auto">
        <table className="w-full text-body">
          <thead className="text-caption text-ink-3 bg-paper-2 sticky top-0 z-10">
            <tr className="text-left">
              <th className="py-2 pl-4 pr-3 font-medium min-w-[260px]">Role</th>
              {d.stages.map((s) => (
                <th key={s} className="py-2 px-2 font-medium num text-right whitespace-nowrap">
                  <span style={{ color: STAGE_COLOR[s] ?? "#6B6B72" }}>{s}</span>
                </th>
              ))}
              <th className="py-2 pr-4 pl-2 font-medium num text-right">Total live</th>
            </tr>
          </thead>
          <tbody>
            <SummaryRow label={`All listed + open roles (${d.total_roles})`} totals={d.totals} bold />
            {filtered.map((g) => (
              <TeamSection key={g.team} group={g} stages={d.stages} />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={d.stages.length + 2} className="py-10 text-center text-ink-3">No roles match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TeamSection({ group }: { group: FunnelMatrix["groups"][number]; stages: string[] }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr className="border-t-2 border-ink/15 bg-paper-2">
        <td className="py-2 pl-3 pr-3" colSpan={1}>
          <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 font-medium">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{group.team}</span>
            <span className="text-caption text-ink-3">({group.roles.length})</span>
          </button>
        </td>
        {COL_KEYS.map((k) => (
          <td key={k} className="py-2 px-2 num text-right tnum font-medium">{fmtInt((group.total as any)[k])}</td>
        ))}
        <td className="py-2 pr-4 pl-2 num text-right tnum font-medium">{fmtInt(group.total.live)}</td>
      </tr>
      {open && group.roles.map((r) => (
        <tr key={r.job_id} id={r.job_id} className="border-t border-hairline hover:bg-paper-2 scroll-mt-24">
          <td className="py-2 pl-7 pr-3">
            <div>{r.title}</div>
            {r.hiring_manager && <div className="mt-0.5"><span className="chip-blue">{r.hiring_manager}</span></div>}
          </td>
          {COL_KEYS.map((k) => (
            <td key={k} className={cellClass(r[k] as number, k)}>{fmtInt(r[k] as number)}</td>
          ))}
          <td className="py-2 pr-4 pl-2 num text-right tnum">{fmtInt(r.live)}</td>
        </tr>
      ))}
    </>
  );
}

function SummaryRow({ label, totals, bold }: { label: string; totals: FunnelMatrix["totals"]; bold?: boolean }) {
  return (
    <tr className={"bg-paper " + (bold ? "border-b-2 border-ink/20 font-medium" : "")}>
      <td className="py-2 pl-4 pr-3">{label}</td>
      {COL_KEYS.map((k) => (
        <td key={k} className="py-2 px-2 num text-right tnum">{fmtInt((totals as any)[k])}</td>
      ))}
      <td className="py-2 pr-4 pl-2 num text-right tnum">{fmtInt(totals.live)}</td>
    </tr>
  );
}

function cellClass(n: number, key: string): string {
  const base = "py-2 px-2 text-right num tabular-nums ";
  if (n === 0) return base + "text-ink-3/50";
  if (key === "rejected") return base + "text-ink-3";
  if (key === "offer") return base + "text-brand-orange-ink font-medium";
  return base;
}
