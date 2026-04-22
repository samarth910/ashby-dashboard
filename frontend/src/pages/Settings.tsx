import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtInt, fmtRelative } from "@/lib/format";

export function Settings() {
  const qc = useQueryClient();
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const fullRefresh = useMutation({
    mutationFn: () => api.refreshStart(true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["health"] }),
  });

  const entities = Object.entries(health.data?.sync.entities ?? {});

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-h1 tracking-tight">Settings</h1>
        <p className="mt-1 text-body text-ink-3">Sync health, API key, cache state.</p>
      </div>

      <section className="card p-4">
        <h2 className="font-display text-h3">Sync state</h2>
        <p className="mt-1 text-small text-ink-3">
          Last run {fmtRelative(health.data?.sync.lastRunCompletedAt)} ·{" "}
          {health.data?.sync.lastRunKind ?? "—"} ·{" "}
          {health.data?.sync.lastRunDurationSec != null ? `${health.data.sync.lastRunDurationSec}s` : "—"}
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-body">
            <thead className="text-caption text-ink-3">
              <tr className="text-left">
                <th className="py-2 pr-4 font-medium">Entity</th>
                <th className="py-2 pr-4 font-medium num text-right">Rows</th>
                <th className="py-2 pr-4 font-medium">Sync token</th>
                <th className="py-2 pr-4 font-medium">Last full</th>
                <th className="py-2 pr-4 font-medium">Last incremental</th>
                <th className="py-2 pr-4 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {entities.map(([name, s]) => (
                <tr key={name} className="border-t border-hairline">
                  <td className="py-2 pr-4">{name}</td>
                  <td className="py-2 pr-4 num text-right">{fmtInt(s.rowCount)}</td>
                  <td className="py-2 pr-4">{s.syncToken ? "✓" : "—"}</td>
                  <td className="py-2 pr-4 text-ink-2">{fmtRelative(s.lastFullSync)}</td>
                  <td className="py-2 pr-4 text-ink-2">{fmtRelative(s.lastIncrementalSync)}</td>
                  <td className="py-2 pr-4 text-brand-orange-ink">{s.lastError ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => fullRefresh.mutate()}
            className="px-3 py-2 rounded-md border border-hairline text-body hover:bg-paper-2"
            disabled={fullRefresh.isPending}
          >
            {fullRefresh.isPending ? "Starting…" : "Force full resync"}
          </button>
          <span className="text-caption text-ink-3">
            Takes 5–15 min. Only use if a sync token expired and you need a fresh baseline.
          </span>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="font-display text-h3">Cache</h2>
        <p className="mt-1 text-small text-ink-3">
          In-memory registry loaded {fmtRelative(health.data?.registry.loadedAt)}
        </p>
        <ul className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-body">
          {Object.entries(health.data?.registry.entities ?? {}).map(([k, v]) => (
            <li key={k} className="rounded-md border border-hairline px-3 py-2 flex justify-between">
              <span>{k}</span>
              <span className="tnum text-ink-3">{fmtInt(v)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
