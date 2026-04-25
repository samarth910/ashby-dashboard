import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { api, type HomeRoleRow, type HomePayload } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/format";

export function Home() {
  const q = useQuery({ queryKey: ["home"], queryFn: api.home, refetchInterval: 60_000 });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <div className="text-ink-3">Failed to load.</div>;
  const d = q.data.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 tracking-tight">Hiring at Sarvam</h1>
          <p className="mt-1 text-body text-ink-3">
            Listed + open roles only. Auto-syncs every 4 hours.
          </p>
        </div>
      </header>

      {d.stuck.length > 0 && <StuckStrip stuck={d.stuck} />}

      <KpiStrip kpis={d.kpis} />

      <RolesByTeam total={d.total_roles} groups={d.roles_by_team} />

      <WeeklyChart rows={d.weekly_by_source} />
    </div>
  );
}

// ---------- KPI strip ----------

function KpiStrip({ kpis }: { kpis: HomePayload["kpis"] }) {
  const cards: { label: string; value: string; tone?: "neutral" | "orange" | "green"; sub?: string }[] = [
    { label: "Applicants", value: fmtInt(kpis.applicants), sub: "across listed + open" },
    { label: "App Review", value: fmtInt(kpis.in_review), sub: "awaiting first screen" },
    { label: "In Interviews", value: fmtInt(kpis.in_interview), sub: "R1 → Final" },
    { label: "Rejected", value: fmtInt(kpis.rejected), tone: "neutral", sub: "archived" },
    { label: "Conversion", value: fmtPct(kpis.conversion_pct, 1), sub: "past app review" },
    { label: "Fill rate", value: kpis.fill_rate == null ? "TBD" : fmtPct(kpis.fill_rate, 0), sub: "openings filled" },
  ];
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <BigKpi key={c.label} {...c} />
      ))}
    </section>
  );
}

function BigKpi({ label, value, sub, tone = "neutral" }: { label: string; value: string; sub?: string; tone?: "neutral" | "orange" | "green" }) {
  const ring =
    tone === "orange" ? "ring-1 ring-brand-orange/30" :
    tone === "green" ? "ring-1 ring-stage-hired/30" : "";
  return (
    <div className={"kpi-card " + ring}>
      <div className="text-caption uppercase tracking-wide text-ink-3">{label}</div>
      <div className="mt-1 font-display text-[34px] sm:text-[40px] leading-[1] text-ink tnum">
        {value}
      </div>
      {sub && <div className="mt-1 text-small text-ink-3">{sub}</div>}
    </div>
  );
}

// ---------- Stuck strip ----------

function StuckStrip({ stuck }: { stuck: HomePayload["stuck"] }) {
  return (
    <section className="rounded-lg border border-brand-orange/40 bg-brand-orange/10 p-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-brand-orange-ink mt-0.5" size={18} />
        <div className="flex-1">
          <div className="text-body text-ink">
            <span className="font-semibold text-brand-orange-ink">Stuck in pipeline:</span>{" "}
            {stuck.length} candidate{stuck.length === 1 ? "" : "s"} past stage SLA.
          </div>
          <ul className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-small">
            {stuck.slice(0, 6).map((s) => (
              <li key={s.application_id} className="flex justify-between gap-2">
                <span className="truncate">
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

// ---------- Roles grouped by team ----------

function RolesByTeam({ total, groups }: { total: number; groups: HomePayload["roles_by_team"] }) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-h3">Open roles ({fmtInt(total)})</h2>
        <Link to="/funnel" className="text-small text-brand-blue hover:underline">Per-round table →</Link>
      </div>
      <p className="mt-1 text-small text-ink-3">
        Grouped by team. Click a team to expand. Click a role to open the per-round table anchored on that role.
      </p>
      <div className="mt-3 divide-y divide-hairline">
        {groups.map((g) => (
          <TeamGroup key={g.team} team={g.team} total={g.total} roles={g.roles} />
        ))}
      </div>
    </section>
  );
}

function TeamGroup({ team, total, roles }: HomePayload["roles_by_team"][number]) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 py-3 text-left hover:bg-paper-2 -mx-1 px-1 rounded-md"
      >
        {open ? <ChevronDown size={16} className="text-ink-3" /> : <ChevronRight size={16} className="text-ink-3" />}
        <span className="font-medium text-body text-ink">{team}</span>
        <span className="text-caption text-ink-3">({roles.length} role{roles.length === 1 ? "" : "s"})</span>
        <div className="ml-auto hidden sm:flex items-center gap-3 text-small text-ink-2 tnum">
          <span>Applied <span className="font-medium text-ink">{fmtInt(total.applicants)}</span></span>
          <span className="text-hairline">·</span>
          <span>Review <span className="font-medium text-ink">{fmtInt(total.in_review)}</span></span>
          <span className="text-hairline">·</span>
          <span>Intv <span className="font-medium text-ink">{fmtInt(total.in_interview)}</span></span>
          <span className="text-hairline">·</span>
          <span>Offer <span className="font-medium text-ink">{fmtInt(total.offer)}</span></span>
          <span className="text-hairline">·</span>
          <span>Rej <span className="text-ink-3">{fmtInt(total.rejected)}</span></span>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead className="text-caption text-ink-3">
              <tr className="text-left">
                <th className="py-1.5 pr-3 font-medium">Role</th>
                <th className="py-1.5 pr-3 font-medium num text-right">Applicants</th>
                <th className="py-1.5 pr-3 font-medium num text-right">Review</th>
                <th className="py-1.5 pr-3 font-medium num text-right">Interviews</th>
                <th className="py-1.5 pr-3 font-medium num text-right">Offer</th>
                <th className="py-1.5 pr-3 font-medium num text-right">Rejected</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => <RoleRow key={r.job_id} r={r} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoleRow({ r }: { r: HomeRoleRow }) {
  return (
    <tr className="border-t border-hairline hover:bg-paper-2">
      <td className="py-2 pr-3">
        <Link to={`/funnel#${r.job_id}`} className="hover:underline">{r.title}</Link>
        {r.hiring_manager && (
          <div className="mt-0.5"><span className="chip-blue">{r.hiring_manager}</span></div>
        )}
      </td>
      <td className="py-2 pr-3 num text-right tnum">{fmtInt(r.applicants)}</td>
      <td className="py-2 pr-3 num text-right tnum">{fmtInt(r.in_review)}</td>
      <td className="py-2 pr-3 num text-right tnum">{fmtInt(r.in_interview)}</td>
      <td className="py-2 pr-3 num text-right tnum">{fmtInt(r.offer)}</td>
      <td className="py-2 pr-3 num text-right tnum text-ink-3">{fmtInt(r.rejected)}</td>
    </tr>
  );
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
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-h3">Applications this week</h2>
        <span className="text-caption text-ink-3">last 7 days · stacked by source</span>
      </div>
      <p className="mt-1 text-small text-ink-3">So-what: where the funnel is filling from.</p>
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
      <div className="h-[300px] card" />
      <div className="h-[260px] card" />
    </div>
  );
}
