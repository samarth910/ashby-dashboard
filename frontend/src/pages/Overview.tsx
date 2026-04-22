import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { api, type FunnelBuckets, type RoleRow } from "@/lib/api";
import { KPI } from "@/components/KPI";
import { fmtInt, fmtPct, fmtDelta } from "@/lib/format";

export function Overview() {
  const q = useQuery({ queryKey: ["overview"], queryFn: api.overview, refetchInterval: 60_000 });

  if (q.isLoading) return <Skeleton />;
  if (q.error || !q.data) return <div className="text-ink-3">Failed to load overview.</div>;
  const d = q.data.data;

  // pivot apps-per-day for stacked bar chart
  const dayMap = new Map<string, Record<string, number>>();
  const sources = new Set<string>();
  for (const r of d.applicationsPerDay30d) {
    sources.add(r.source);
    if (!dayMap.has(r.date)) dayMap.set(r.date, { date: r.date as any });
    dayMap.get(r.date)![r.source] = (dayMap.get(r.date)![r.source] || 0) + r.count;
  }
  const chartData = Array.from(dayMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, row]) => ({ date, ...row }));
  const sourceList = Array.from(sources);
  const stuckCount = d.stuckCandidates.length;

  return (
    <div className="space-y-6">
      {/* Stuck strip — orange, load-bearing */}
      {stuckCount > 0 && (
        <div className="rounded-lg border border-brand-orange/40 bg-brand-orange/10 p-3 flex items-start gap-3">
          <AlertTriangle className="text-brand-orange-ink mt-0.5" size={18} />
          <div className="text-body text-ink">
            <span className="font-semibold text-brand-orange-ink">Stuck in pipeline:</span>{" "}
            {stuckCount} candidate{stuckCount === 1 ? "" : "s"} haven't moved in over a week.{" "}
            <a href="#stuck" className="underline decoration-brand-orange/60 underline-offset-2">Jump to list</a>
          </div>
        </div>
      )}

      <section>
        <h1 className="font-display text-h1 tracking-tight">Overview</h1>
        <p className="mt-1 text-body text-ink-3">Is hiring on track this week?</p>
      </section>

      {/* KPIs — horizontal snap on mobile */}
      <section className="-mx-4 sm:mx-0 px-4 sm:px-0 flex sm:grid gap-3 overflow-x-auto snap-x snap-mandatory sm:grid-cols-3 lg:grid-cols-5 sm:overflow-visible">
        <div className="min-w-[70%] sm:min-w-0 snap-center">
          <KPI label="Open roles (listed)" value={d.kpis.openRoles} caption="Posted + status Open" />
        </div>
        <div className="min-w-[70%] sm:min-w-0 snap-center">
          <KPI label="Live candidates" value={d.rolesSummary.live} caption="Across all open roles" />
        </div>
        <div className="min-w-[70%] sm:min-w-0 snap-center">
          <KPI label="Apps last 7d" value={d.kpis.applicationsLast7} caption={`${fmtDelta(d.kpis.applicationsDelta)} vs prior 7d`} />
        </div>
        <div className="min-w-[70%] sm:min-w-0 snap-center">
          <KPI label="Offer accept rate" value={fmtPct(d.kpis.offerAcceptRate30d)} caption="Trailing 30 days" />
        </div>
        <div className="min-w-[70%] sm:min-w-0 snap-center">
          <KPI label="Stuck (>7d)" value={stuckCount} caption="Active apps with no change" tone={stuckCount > 0 ? "orange" : "neutral"} />
        </div>
      </section>

      {/* Conversion funnel */}
      <ConversionFunnelCard funnel={d.conversionFunnel} />

      {/* Roles table */}
      <RolesCard
        summary={d.rolesSummary}
        rows={d.roles}
      />

      {/* Applications per day */}
      <section className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-h3">Applications per day</h2>
          <span className="text-caption text-ink-3">last 30 days</span>
        </div>
        <p className="mt-1 text-small text-ink-3">So-what: spot spikes or dips in top-of-funnel flow.</p>
        <div className="mt-3 h-[260px]">
          {chartData.length === 0 ? (
            <Empty>No application activity in the last 30 days.</Empty>
          ) : (
            <ResponsiveContainer>
              <BarChart data={chartData}>
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
                    fill={pickSourceColor(s, i)}
                    radius={i === sourceList.length - 1 ? [4, 4, 0, 0] : 0}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Stuck candidates — dedicated section */}
      <section id="stuck" className="card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-h3 text-brand-orange-ink">Stuck in pipeline</h2>
          <span className="text-caption text-ink-3">top 5 by time since update</span>
        </div>
        <p className="mt-1 text-small text-ink-3">So-what: accountability. These candidates are waiting on us.</p>
        <div className="mt-3 overflow-x-auto">
          {d.stuckCandidates.length === 0 ? (
            <Empty>Nobody is stuck. Everyone has moved recently.</Empty>
          ) : (
            <table className="w-full text-body">
              <thead className="text-caption text-ink-3">
                <tr className="text-left">
                  <th className="py-2 pr-4 font-medium">Candidate</th>
                  <th className="py-2 pr-4 font-medium">Role</th>
                  <th className="py-2 pr-4 font-medium">Stage</th>
                  <th className="py-2 pr-4 font-medium num text-right">Days idle</th>
                </tr>
              </thead>
              <tbody>
                {d.stuckCandidates.map((s) => (
                  <tr key={s.application_id} className="border-t border-hairline">
                    <td className="py-2 pr-4">{s.candidate_name || s.candidate_id}</td>
                    <td className="py-2 pr-4">
                      <Link to={`/roles/${s.job_id}`} className="hover:underline">{s.job_title}</Link>
                    </td>
                    <td className="py-2 pr-4"><span className="chip-gray">{s.stage}</span></td>
                    <td className="py-2 pr-4 num text-right text-brand-orange-ink tabular-nums">
                      {fmtInt(s.days_since_update)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------- Conversion funnel ----------

const FUNNEL_STEPS: { key: keyof FunnelBuckets; label: string; color: string }[] = [
  { key: "applied", label: "Applied", color: "#2F5BFF" },
  { key: "live", label: "Live", color: "#7AA0FF" },
  { key: "in_interview", label: "In Interviews", color: "#8B4DE8" },
  { key: "offer", label: "Offer", color: "#FF6A1A" },
  { key: "rejected", label: "Rejected", color: "#6B6B72" },
];

function ConversionFunnelCard({ funnel }: { funnel: FunnelBuckets }) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-h3">Conversion funnel</h2>
        <span className="text-caption text-ink-3">current state, listed + open roles</span>
      </div>
      <p className="mt-1 text-small text-ink-3">
        So-what: how many candidates are alive in each bucket right now.
      </p>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
        {FUNNEL_STEPS.map((s, i) => {
          const count = funnel[s.key];
          const base = funnel.applied || 1;
          const pct = s.key === "applied" ? 100 : (count / base) * 100;
          return (
            <div key={s.key} className="relative">
              <div
                className="rounded-lg border p-3 overflow-hidden"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0 -z-0 opacity-[0.08]"
                  style={{ background: s.color }}
                />
                <div className="relative">
                  <div className="text-caption uppercase tracking-wide text-ink-3" style={{ color: s.color }}>
                    {s.label}
                  </div>
                  <div className="mt-1 font-display text-[26px] leading-[1.05] text-ink tnum">
                    {fmtInt(count)}
                  </div>
                  <div className="text-small text-ink-3 tnum">{pct.toFixed(0)}% of applied</div>
                </div>
              </div>
              {i < FUNNEL_STEPS.length - 1 && (
                <ArrowRight
                  className="hidden sm:block absolute top-1/2 -right-3 -translate-y-1/2 text-ink-3"
                  size={16}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Roles table ----------

function RolesCard({
  summary,
  rows,
}: {
  summary: FunnelBuckets & { total_roles: number };
  rows: RoleRow[];
}) {
  return (
    <section className="card p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-h3">Open roles</h2>
        <Link to="/roles" className="text-small text-brand-blue hover:underline">All roles →</Link>
      </div>
      <p className="mt-1 text-small text-ink-3">
        So-what: which roles are moving, which are stalled. Totals row = everything currently listed + open.
      </p>

      {/* mobile cards */}
      <div className="md:hidden mt-3 space-y-2">
        <SummaryCard summary={summary} />
        {rows.map((r) => (
          <Link to={`/roles/${r.job_id}`} key={r.job_id} className="block rounded-lg border border-hairline p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-body">{r.title}</div>
                {r.hiring_manager && <HMChip name={r.hiring_manager} />}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1 text-center">
              <Stat label="Applied" value={r.applied} />
              <Stat label="Live" value={r.live} />
              <Stat label="Intvs" value={r.in_interview} />
              <Stat label="Offer" value={r.offer} />
              <Stat label="Rej" value={r.rejected} />
            </div>
          </Link>
        ))}
        {!rows.length && (
          <div className="text-small text-ink-3 py-4 text-center">No listed + open roles.</div>
        )}
      </div>

      {/* desktop table */}
      <div className="hidden md:block mt-3 overflow-x-auto">
        <table className="w-full text-body">
          <thead className="text-caption text-ink-3">
            <tr className="text-left">
              <th className="py-2 pr-4 font-medium">Role</th>
              <th className="py-2 pr-4 font-medium num text-right">Applied</th>
              <th className="py-2 pr-4 font-medium num text-right">Live</th>
              <th className="py-2 pr-4 font-medium num text-right">Interviews</th>
              <th className="py-2 pr-4 font-medium num text-right">Offer</th>
              <th className="py-2 pr-4 font-medium num text-right">Rejected</th>
            </tr>
          </thead>
          <tbody>
            {/* Summary row on top */}
            <tr className="border-t-2 border-ink/20 bg-paper-2 font-medium">
              <td className="py-2 pr-4">
                <div>All listed + open roles</div>
                <div className="text-caption text-ink-3 font-normal">{summary.total_roles} role{summary.total_roles === 1 ? "" : "s"}</div>
              </td>
              <td className="py-2 pr-4 num text-right tnum">{fmtInt(summary.applied)}</td>
              <td className="py-2 pr-4 num text-right tnum">{fmtInt(summary.live)}</td>
              <td className="py-2 pr-4 num text-right tnum">{fmtInt(summary.in_interview)}</td>
              <td className="py-2 pr-4 num text-right tnum">{fmtInt(summary.offer)}</td>
              <td className="py-2 pr-4 num text-right tnum text-ink-3">{fmtInt(summary.rejected)}</td>
            </tr>

            {rows.map((r) => (
              <tr key={r.job_id} className="border-t border-hairline hover:bg-paper-2">
                <td className="py-2 pr-4">
                  <Link to={`/roles/${r.job_id}`} className="hover:underline">{r.title}</Link>
                  {r.hiring_manager && (
                    <div className="mt-0.5"><HMChip name={r.hiring_manager} /></div>
                  )}
                </td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.applied)}</td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.live)}</td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.in_interview)}</td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.offer)}</td>
                <td className="py-2 pr-4 num text-right tnum text-ink-3">{fmtInt(r.rejected)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-ink-3">No listed + open roles.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SummaryCard({ summary }: { summary: FunnelBuckets & { total_roles: number } }) {
  return (
    <div className="rounded-lg bg-ink text-paper p-3">
      <div className="text-caption uppercase tracking-wide text-paper/70">
        {summary.total_roles} open role{summary.total_roles === 1 ? "" : "s"} — totals
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1 text-center">
        <Stat label="Applied" value={summary.applied} tone="dark" />
        <Stat label="Live" value={summary.live} tone="dark" />
        <Stat label="Intvs" value={summary.in_interview} tone="dark" />
        <Stat label="Offer" value={summary.offer} tone="dark" />
        <Stat label="Rej" value={summary.rejected} tone="dark" />
      </div>
    </div>
  );
}

function HMChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-brand-blue/10 text-brand-blue-ink px-1.5 py-0.5 text-caption">
      {name}
    </span>
  );
}

function Stat({ label, value, tone = "light" }: { label: string; value: number; tone?: "light" | "dark" }) {
  const labelCls = tone === "dark" ? "text-paper/60" : "text-ink-3";
  const valueCls = tone === "dark" ? "text-paper" : "text-ink";
  return (
    <div>
      <div className={`text-caption ${labelCls}`}>{label}</div>
      <div className={`text-body tabular-nums ${valueCls}`}>{fmtInt(value)}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-6 w-40 bg-paper-2 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 card" />)}
      </div>
      <div className="h-[180px] card" />
      <div className="h-[400px] card" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-small text-ink-3">
      {children}
    </div>
  );
}

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
function pickSourceColor(name: string, i: number): string {
  return SOURCE_COLORS[name] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}
