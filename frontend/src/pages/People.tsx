import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtInt } from "@/lib/format";

export function People() {
  const q = useQuery({ queryKey: ["people"], queryFn: api.people });
  if (q.isLoading) return <div className="text-ink-3">Loading…</div>;
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-h1 tracking-tight">People load</h1>
        <p className="mt-1 text-body text-ink-3">Is anyone overloaded or coasting?</p>
      </div>

      <section className="card p-4 overflow-x-auto">
        <table className="w-full text-body">
          <thead className="text-caption text-ink-3">
            <tr className="text-left">
              <th className="py-2 pr-4 font-medium">Hiring manager</th>
              <th className="py-2 pr-4 font-medium num text-right">Open roles</th>
              <th className="py-2 pr-4 font-medium num text-right">Live</th>
              <th className="py-2 pr-4 font-medium num text-right">Interviews</th>
              <th className="py-2 pr-4 font-medium num text-right">Offer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.hiring_manager} className="border-t border-hairline">
                <td className="py-2 pr-4">{r.hiring_manager}</td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.active_roles)}</td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.live)}</td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.in_interview)}</td>
                <td className="py-2 pr-4 num text-right tnum">{fmtInt(r.offer)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-ink-3">No hiring managers assigned yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
