import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtInt } from "@/lib/format";

export function Velocity() {
  const q = useQuery({ queryKey: ["velocity"], queryFn: api.velocity });
  if (q.isLoading) return <div className="text-ink-3">Loading…</div>;
  if (!q.data) return <div className="text-ink-3">No data.</div>;
  const { heatmap, funnel90d } = q.data.data;

  const jobs = Array.from(new Set(heatmap.map((r) => r.title ?? r.job_id)));
  const stages = Array.from(new Set(heatmap.map((r) => r.stage)));
  const max = Math.max(1, ...heatmap.map((r) => r.median_days));

  const cellFor = (job: string, stage: string) =>
    heatmap.find((r) => (r.title ?? r.job_id) === job && r.stage === stage);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-h1 tracking-tight">Velocity</h1>
        <p className="mt-1 text-body text-ink-3">Where are the bottlenecks across all roles?</p>
      </div>

      <section className="card p-4 overflow-x-auto">
        <h2 className="font-display text-h3">Stage heatmap</h2>
        <p className="mt-1 text-small text-ink-3">
          So-what: darker cell = candidates sit longer in that stage. (Approximate: updatedAt − createdAt; pending proper stage history in v1.1.)
        </p>
        <table className="mt-3 min-w-full text-caption tnum border-collapse">
          <thead>
            <tr>
              <th className="text-left font-medium text-ink-3 sticky left-0 bg-paper">Role</th>
              {stages.map((s) => (
                <th key={s} className="px-2 py-1 font-medium text-ink-3 text-center">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j}>
                <td className="sticky left-0 bg-paper pr-3 py-1 text-ink-2 whitespace-nowrap">{j}</td>
                {stages.map((s) => {
                  const cell = cellFor(j, s);
                  if (!cell) return <td key={s} className="text-ink-3 px-2 text-center">—</td>;
                  const intensity = Math.min(0.85, 0.1 + (cell.median_days / max) * 0.8);
                  return (
                    <td
                      key={s}
                      className="px-2 py-1 text-center text-ink"
                      style={{ backgroundColor: `rgba(47,91,255,${intensity.toFixed(2)})` }}
                      title={`${cell.median_days} d`}
                    >
                      {cell.median_days.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="font-display text-h3">Conversion funnel — last 90 days</h2>
        <p className="mt-1 text-small text-ink-3">So-what: where is the pipeline leaking?</p>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
          <Step label="Applied" value={funnel90d.applied} />
          <Step label="Past review" value={funnel90d.past_review} prev={funnel90d.applied} />
          <Step label="Interview" value={funnel90d.interview} prev={funnel90d.past_review} />
          <Step label="Offer" value={funnel90d.offer} prev={funnel90d.interview} />
          <Step label="Hired" value={funnel90d.hired} prev={funnel90d.offer} />
        </div>
      </section>
    </div>
  );
}

function Step({ label, value, prev }: { label: string; value: number; prev?: number }) {
  const pct = prev && prev > 0 ? (value / prev) * 100 : null;
  return (
    <div className="rounded-lg border border-hairline p-3">
      <div className="text-caption text-ink-3 uppercase">{label}</div>
      <div className="mt-1 font-display text-h2 tnum">{fmtInt(value)}</div>
      {pct !== null && <div className="text-small text-ink-3">{pct.toFixed(0)}% of prior</div>}
    </div>
  );
}
