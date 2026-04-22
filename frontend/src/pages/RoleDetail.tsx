import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/format";

type Tab = "overview" | "activity";

export function RoleDetail() {
  const { jobId = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const q = useQuery({ queryKey: ["role", jobId], queryFn: () => api.role(jobId), enabled: !!jobId });
  const act = useQuery({
    queryKey: ["role-activity", jobId],
    queryFn: () => api.roleActivity(jobId, 7),
    enabled: tab === "activity" && !!jobId,
  });

  if (!jobId) return <div>Missing job id.</div>;
  if (q.isLoading) return <div className="text-ink-3">Loading…</div>;
  if (q.error || !q.data) return <div className="text-ink-3">Failed to load role.</div>;
  const d = q.data.data;

  return (
    <div className="space-y-5">
      <nav className="text-small text-ink-3">
        <Link to="/roles" className="hover:underline">Roles</Link>
        <span className="mx-1">/</span>
        <span className="text-ink">{d.meta.title}</span>
      </nav>

      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 tracking-tight">{d.meta.title}</h1>
          <p className="mt-1 text-body text-ink-3">How is this role doing?</p>
        </div>
        <div className="flex gap-1 text-body">
          {(["overview", "activity"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "px-3 py-1.5 rounded-md capitalize " +
                (tab === t ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2")
              }
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {tab === "overview" && (
        <>
          <section className="card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-h3">Funnel</h2>
              <span className="text-caption text-ink-3">active / all-time / last 7d / median days</span>
            </div>
            <p className="mt-1 text-small text-ink-3">So-what: where do candidates concentrate and where do they stall?</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-body">
                <thead className="text-caption text-ink-3">
                  <tr className="text-left">
                    <th className="py-2 pr-4 font-medium">Stage</th>
                    <th className="py-2 pr-4 font-medium num text-right">Active now</th>
                    <th className="py-2 pr-4 font-medium num text-right">All-time</th>
                    <th className="py-2 pr-4 font-medium num text-right">Last 7d</th>
                    <th className="py-2 pr-4 font-medium num text-right">Median days</th>
                  </tr>
                </thead>
                <tbody>
                  {d.funnel.map((r) => (
                    <tr key={r.stage} className="border-t border-hairline">
                      <td className="py-2 pr-4">{r.stage}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.active_now)}</td>
                      <td className="py-2 pr-4 num text-right text-ink-2">{fmtInt(r.all_time)}</td>
                      <td className="py-2 pr-4 num text-right text-ink-2">{fmtInt(r.last_7d)}</td>
                      <td className="py-2 pr-4 num text-right text-ink-2">
                        {r.median_days != null ? r.median_days.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-h3">Source performance</h2>
              <span className="text-caption text-ink-3">Kula_Migrated + Unspecified hidden</span>
            </div>
            <p className="mt-1 text-small text-ink-3">So-what: which inbound channels are moving past review for this role?</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-body">
                <thead className="text-caption text-ink-3">
                  <tr className="text-left">
                    <th className="py-2 pr-4 font-medium">Source</th>
                    <th className="py-2 pr-4 font-medium num text-right">Applied</th>
                    <th className="py-2 pr-4 font-medium num text-right">Past review</th>
                    <th className="py-2 pr-4 font-medium num text-right">Interview</th>
                    <th className="py-2 pr-4 font-medium num text-right">Offered</th>
                    <th className="py-2 pr-4 font-medium num text-right">Hired</th>
                    <th className="py-2 pr-4 font-medium num text-right">% past review</th>
                  </tr>
                </thead>
                <tbody>
                  {d.sources.map((r) => (
                    <tr key={r.source} className="border-t border-hairline">
                      <td className="py-2 pr-4">{r.source}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.applied)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.past_review)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.to_interview)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.offered)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.hired)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtPct(r.past_review_pct)}</td>
                    </tr>
                  ))}
                  {!d.sources.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-ink-3">No source data for this role.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === "activity" && (
        <section className="card p-4">
          <h2 className="font-display text-h3">Last 7 days</h2>
          <p className="mt-1 text-small text-ink-3">
            So-what: what moved for this role this week?
          </p>
          <div className="mt-3 grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-caption text-ink-3 mb-1">New applications per day</div>
              <div className="h-[240px]">
                {act.isLoading ? (
                  <div className="h-full w-full flex items-center justify-center text-ink-3">Loading…</div>
                ) : (
                  <ResponsiveContainer>
                    <BarChart data={act.data?.data.newApplications ?? []}>
                      <CartesianGrid stroke="#EAEAE4" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B6B72" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#6B6B72" }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2F5BFF" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div>
              <div className="text-caption text-ink-3 mb-1">Stage entries per day</div>
              <div className="h-[240px]">
                {act.isLoading ? (
                  <div className="h-full w-full flex items-center justify-center text-ink-3">Loading…</div>
                ) : (
                  <ResponsiveContainer>
                    <BarChart data={act.data?.data.stageEntries ?? []}>
                      <CartesianGrid stroke="#EAEAE4" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B6B72" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#6B6B72" }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#8B4DE8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
