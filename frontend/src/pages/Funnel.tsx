import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

type FlatRow = FunnelMatrix["groups"][number]["roles"][number] & { _isTeamFirst?: boolean };

export function Funnel() {
  const q = useQuery({ queryKey: ["funnel"], queryFn: api.funnel, refetchInterval: 60_000 });
  const [search, setSearch] = useState("");

  const rows = useMemo<FlatRow[]>(() => {
    const groups = q.data?.data.groups ?? [];
    const sortedGroups = [...groups].sort((a, b) => a.team.localeCompare(b.team));
    const out: FlatRow[] = [];
    for (const g of sortedGroups) {
      const within = [...g.roles].sort((a, b) => b.applied - a.applied);
      within.forEach((r, i) => out.push({ ...r, _isTeamFirst: i === 0 }));
    }
    const s = search.trim().toLowerCase();
    return s
      ? out.filter((r) =>
          r.title.toLowerCase().includes(s) ||
          (r.hiring_manager ?? "").toLowerCase().includes(s) ||
          r.team.toLowerCase().includes(s),
        )
      : out;
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
          </p>
        </div>
        <input
          className="h-9 rounded-md border border-hairline bg-paper px-3 text-body placeholder:text-ink-3 sm:w-72"
          placeholder="Search role, team, hiring manager"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </header>

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-body border-collapse">
            <thead className="text-caption text-ink-3 bg-paper-2 border-y border-hairline">
              <tr className="text-left">
                <th className="py-2 pl-4 sm:pl-5 pr-3 font-medium min-w-[260px]">Role</th>
                <th className="py-2 px-3 font-medium">Team</th>
                {d.stages.map((s) => (
                  <th key={s} className="py-2 px-2 font-medium num text-right whitespace-nowrap">
                    <span style={{ color: STAGE_COLOR[s] ?? "#6B6B72" }}>{s}</span>
                  </th>
                ))}
                <th className="py-2 pr-4 sm:pr-5 pl-2 font-medium num text-right">Live</th>
              </tr>
            </thead>
            <tbody>
              <SummaryRow label={`All listed + open roles (${d.total_roles})`} totals={d.totals} />
              {rows.map((r) => (
                <tr
                  key={r.job_id}
                  id={r.job_id}
                  className={
                    "border-b border-hairline last:border-b-0 hover:bg-paper-2 scroll-mt-24 " +
                    (r._isTeamFirst ? "border-t border-hairline/60" : "")
                  }
                >
                  <td className="py-2.5 pl-4 sm:pl-5 pr-3 align-top">
                    <div>{r.title}</div>
                    {r.hiring_manager && (
                      <div className="mt-0.5 text-caption text-ink-3">{r.hiring_manager}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 align-top">
                    <span className="chip-gray">{r.team}</span>
                  </td>
                  {COL_KEYS.map((k) => (
                    <td key={k} className={cellClass(r[k] as number, k)}>{fmtInt(r[k] as number)}</td>
                  ))}
                  <td className="py-2.5 pr-4 sm:pr-5 pl-2 num text-right tnum align-top">{fmtInt(r.live)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={d.stages.length + 3} className="py-10 text-center text-ink-3">No roles match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, totals }: { label: string; totals: FunnelMatrix["totals"] }) {
  return (
    <tr className="border-b border-hairline bg-paper-2 font-medium">
      <td className="py-2 pl-4 sm:pl-5 pr-3" colSpan={2}>{label}</td>
      {COL_KEYS.map((k) => (
        <td key={k} className="py-2 px-2 num text-right tnum">{fmtInt((totals as any)[k])}</td>
      ))}
      <td className="py-2 pr-4 sm:pr-5 pl-2 num text-right tnum">{fmtInt(totals.live)}</td>
    </tr>
  );
}

function cellClass(n: number, key: string): string {
  const base = "py-2.5 px-2 text-right num tabular-nums align-top ";
  if (n === 0) return base + "text-ink-3/50";
  if (key === "rejected") return base + "text-ink-3";
  if (key === "offer") return base + "text-brand-orange-ink font-medium";
  return base;
}
