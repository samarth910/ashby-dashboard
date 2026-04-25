import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle } from "lucide-react";
import { api, type HomeRoleRow, type HomePayload } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/format";

export function Home() {
  const q = useQuery({ queryKey: ["home"], queryFn: api.home, refetchInterval: 60_000 });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <div className="text-ink-3">Failed to load.</div>;
  const d = q.data.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-h1 tracking-tight">Hiring at Sarvam</h1>
        <p className="mt-1 text-body text-ink-3">
          Listed + open roles only. Auto-syncs every 4 hours.
        </p>
      </header>

      {d.stuck.length > 0 && <StuckStrip stuck={d.stuck} />}

      <KpiStrip kpis={d.kpis} />

      <RolesTable total={d.total_roles} groups={d.roles_by_team} />

      <WeeklyChart rows={d.weekly_by_source} />
    </div>
  );
}

// ---------- KPI strip ----------

function KpiStrip({ kpis }: { kpis: HomePayload["kpis"] }) {
  const cards: { label: string; value: string; sub?: string }[] = [
    { label: "Applicants", value: fmtInt(kpis.applicants), sub: "across listed + open" },
    { label: "App Review", value: fmtInt(kpis.in_review), sub: "awaiting first screen" },
    { label: "In Interviews", value: fmtInt(kpis.in_interview), sub: "R1 → Final" },
    { label: "Rejected", value: fmtInt(kpis.rejected), sub: "archived" },
    { label: "Conversion", value: fmtPct(kpis.conversion_pct, 1), sub: "past app review" },
    { label: "Fill rate", value: kpis.fill_rate == null ? "TBD" : fmtPct(kpis.fill_rate, 0), sub: "openings filled" },
  ];
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="kpi-card">
          <div className="text-caption uppercase tracking-wide text-ink-3">{c.label}</div>
          <div className="mt-2 font-display text-[34px] sm:text-[38px] leading-none text-ink tnum">
            {c.value}
          </div>
          {c.sub && <div className="mt-1.5 text-small text-ink-3">{c.sub}</div>}
        </div>
      ))}
    </section>
  );
}

// ---------- Stuck strip ----------

function StuckStrip({ stuck }: { stuck: HomePayload["stuck"] }) {
  return (
    <section className="rounded-lg border border-brand-orange/40 bg-brand-orange/10 p-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-brand-orange-ink mt-0.5 shrink-0" size={18} />
        <div className="flex-1 min-w-0">
          <div className="text-body text-ink">
            <span className="font-semibold text-brand-orange-ink">Stuck in pipeline:</span>{" "}
            {stuck.length} candidate{stuck.length === 1 ? "" : "s"} past stage SLA.
          </div>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-small">
            {stuck.slice(0, 6).map((s) => (
              <li key={s.application_id} className="flex justify-between gap-2 min-w-0">
                <span className="truncate min-w-0">
                  <span className="text-ink">{s.candidate_name || s.candidate_id}</span>
                  <span className="text-ink-3"> · </span>
                  <Link to={`/funnel#${s.job_id}`} className="text-ink-2 hover:underline">{s.job_title}</Link>
                </span>
                <span className="shrink-0 text-brand-orange-ink tnum">
                  {s.stage_title} · {Number(s.days_in_stage).toFixed(1)}d
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------- Roles table (flat, ordered by team, no accordions) ----------

type FlatRow = HomeRoleRow & { _isTeamFirst?: boolean };

function RolesTable({ total, groups }: { total: number; groups: HomePayload["roles_by_team"] }) {
  const rows = useMemo<FlatRow[]>(() => {
    const sorted = [...groups].sort((a, b) => a.team.localeCompare(b.team));
    const out: FlatRow[] = [];
    for (const g of sorted) {
      const within = [...g.roles].sort((a, b) => b.applicants - a.applicants);
      within.forEach((r, i) => out.push({ ...r, _isTeamFirst: i === 0 }));
    }
    return out;
  }, [groups]);

  const totals = useMemo(() => {
    const t = { applicants: 0, in_review: 0, in_interview: 0, offer: 0, rejected: 0 };
    for (const r of rows) {
      t.applicants += r.applicants;
      t.in_review += r.in_review;
      t.in_interview += r.in_interview;
      t.offer += r.offer;
      t.rejected += r.rejected;
    }
    return t;
  }, [rows]);

  return (
    <section className="card p-0 overflow-hidden">
      <header className="flex items-baseline justify-between px-4 sm:px-5 pt-4 pb-3">
        <h2 className="font-display text-h3">Open roles ({fmtInt(total)})</h2>
        <Link to="/funnel" className="text-small text-brand-blue hover:underline">Per-round table →</Link>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-body border-collapse">
          <thead className="text-caption text-ink-3 bg-paper-2 border-y border-hairline">
            <tr className="text-left">
              <th className="py-2 pl-4 sm:pl-5 pr-3 font-medium w-[36%]">Role</th>
              <th className="py-2 px-3 font-medium w-[16%]">Team</th>
              <th className="py-2 px-3 font-medium num text-right">Applicants</th>
              <th className="py-2 px-3 font-medium num text-right">Review</th>
              <th className="py-2 px-3 font-medium num text-right">Interviews</th>
              <th className="py-2 px-3 font-medium num text-right">Offer</th>
              <th className="py-2 pr-4 sm:pr-5 pl-3 font-medium num text-right">Rejected</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-hairline bg-paper-2 text-body font-medium">
              <td className="py-2 pl-4 sm:pl-5 pr-3" colSpan={2}>All listed + open</td>
              <td className="py-2 px-3 num text-right tnum">{fmtInt(totals.applicants)}</td>
              <td className="py-2 px-3 num text-right tnum">{fmtInt(totals.in_review)}</td>
              <td className="py-2 px-3 num text-right tnum">{fmtInt(totals.in_interview)}</td>
              <td className="py-2 px-3 num text-right tnum">{fmtInt(totals.offer)}</td>
              <td className="py-2 pr-4 sm:pr-5 pl-3 num text-right tnum text-ink-3">{fmtInt(totals.rejected)}</td>
            </tr>
            {rows.map((r) => (
              <tr
                key={r.job_id}
                className={
                  "border-b border-hairline last:border-b-0 hover:bg-paper-2 " +
                  (r._isTeamFirst ? "border-t border-hairline/60" : "")
                }
              >
                <td className="py-2.5 pl-4 sm:pl-5 pr-3">
                  <Link to={`/funnel#${r.job_id}`} className="hover:underline">{r.title}</Link>
                  {r.hiring_manager && (
                    <div className="mt-0.5 text-caption text-ink-3">{r.hiring_manager}</div>
                  )}
                </td>
                <td className="py-2.5 px-3 align-top">
                  <span className="chip-gray">{r.team}</span>
                </td>
                <td className="py-2.5 px-3 num text-right tnum align-top">{fmtInt(r.applicants)}</td>
                <td className={cellClass(r.in_review)}>{fmtInt(r.in_review)}</td>
                <td className={cellClass(r.in_interview)}>{fmtInt(r.in_interview)}</td>
                <td className={cellClass(r.offer, "offer")}>{fmtInt(r.offer)}</td>
                <td className={cellClass(r.rejected, "rej") + " pr-4 sm:pr-5 pl-3"}>{fmtInt(r.rejected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function cellClass(n: number, kind?: "offer" | "rej"): string {
  const base = "py-2.5 px-3 num text-right tabular-nums align-top ";
  if (n === 0) return base + "text-ink-3/50";
  if (kind === "rej") return base + "text-ink-3";
  if (kind === "offer") return base + "text-brand-orange-ink font-medium";
  return base;
}

// ---------- Weekly applications by source ----------

const SOURCE_COLORS: Record<string, string> = {
  "Applied": "#2F5BFF",
  "Candidate_Cold_Email": "#8B4DE8",
  "Referral": "#16A34A",
  "Referral Link": "#16A34A",
  "LinkedIn": "#0A66C2",
  "Indeed": "#003A9B",
  "Indeed Listings": "#003A9B",
};
const FALLBACK_PALETTE = ["#7AA0FF", "#8B4DE8", "#E85BBE", "#FFB37A", "#16A34A", "#6B6B72", "#2F5BFF"];

function WeeklyChart({ rows }: { rows: HomePayload["weekly_by_source"] }) {
  const dayMap = new Map<string, Record<string, number>>();
  const sources = new Set<string>();
  for (const r of rows) {
    sources.add(r.source);
    if (!dayMap.has(r.date)) dayMap.set(r.date, { date: r.date as any });
    dayMap.get(r.date)![r.source] = (dayMap.get(r.date)![r.source] || 0) + r.count;
  }
  const data = Array.from(dayMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, row]) => ({ date, ...row }));
  const sourceList = Array.from(sources);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-h3">Applications this week</h2>
        <span className="text-caption text-ink-3">last 7 days · stacked by source</span>
      </div>
      <div className="mt-3 h-[260px]">
        {data.length === 0 ? (
          <div className="h-full w-full flex items-center justify-center text-small text-ink-3">
            No applications in the last 7 days.
          </div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid stroke="#EAEAE4" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B6B72" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6B72" }} />
              <Tooltip cursor={{ fill: "rgba(47,91,255,0.06)" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {sourceList.map((s, i) => (
                <Bar
                  key={s}
                  dataKey={s}
                  stackId="a"
                  fill={SOURCE_COLORS[s] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]}
                  radius={i === sourceList.length - 1 ? [4, 4, 0, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-72 bg-paper-2 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 card" />)}
      </div>
      <div className="h-[400px] card" />
      <div className="h-[260px] card" />
    </div>
  );
}
