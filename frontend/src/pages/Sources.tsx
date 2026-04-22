import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "@/lib/api";
import { fmtInt, fmtPct } from "@/lib/format";

const PALETTE = ["#2F5BFF", "#8B4DE8", "#FF6A1A", "#16A34A", "#E85BBE", "#7AA0FF", "#FFB37A"];

export function Sources() {
  const [window, setWindow] = useState<"7d" | "30d" | "90d" | "all">("90d");
  const q = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  if (q.isLoading) return <div className="text-ink-3">Loading…</div>;
  if (!q.data) return <div className="text-ink-3">No data.</div>;

  const table = q.data.data.table.filter((r) => r.window === window);
  const share = q.data.data.thisWeekShare;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-h1 tracking-tight">Sources</h1>
        <p className="mt-1 text-body text-ink-3">Which channels are worth more money and time?</p>
      </div>

      <section className="card p-4 grid md:grid-cols-2 gap-4">
        <div>
          <h2 className="font-display text-h3">This-week share</h2>
          <p className="mt-1 text-small text-ink-3">So-what: where is volume coming from right now?</p>
          <div className="h-[260px] mt-3">
            {share.length === 0 ? (
              <div className="h-full flex items-center justify-center text-ink-3">No applications this week.</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={share} dataKey="count" nameKey="source" innerRadius={60} outerRadius={90} paddingAngle={2}>
                    {share.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-small">
            {share.map((s, i) => (
              <li key={s.source} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                  {s.source}
                </span>
                <span className="tnum">{fmtInt(s.count)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-h3">Performance</h2>
            <select
              className="h-8 rounded-md border border-hairline bg-paper px-2 text-small"
              value={window}
              onChange={(e) => setWindow(e.target.value as any)}
            >
              <option value="7d">Last 7d</option>
              <option value="30d">Last 30d</option>
              <option value="90d">Last 90d</option>
              <option value="all">All time</option>
            </select>
          </div>
          <p className="mt-1 text-small text-ink-3">Sorted by applied-to-hired conversion.</p>
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
                  <th className="py-2 pr-4 font-medium num text-right">App → hire</th>
                </tr>
              </thead>
              <tbody>
                {table
                  .slice()
                  .sort((a, b) => b.hired / Math.max(1, b.applied) - a.hired / Math.max(1, a.applied))
                  .map((r) => (
                    <tr key={r.source} className="border-t border-hairline">
                      <td className="py-2 pr-4">{r.source}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.applied)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.past_review)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.to_interview)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.offered)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtInt(r.hired)}</td>
                      <td className="py-2 pr-4 num text-right">{fmtPct(r.hired / Math.max(1, r.applied), 1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
