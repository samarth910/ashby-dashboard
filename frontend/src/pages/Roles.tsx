import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Role } from "@/lib/api";
import { fmtInt, fmtRelative } from "@/lib/format";

type SortKey = keyof Pick<
  Role,
  "title" | "hiring_manager" | "days_open" | "applied" | "live" | "in_interview" | "offer" | "rejected" | "status"
>;

export function Roles() {
  const [scope, setScope] = useState<"listed_open" | "all">("listed_open");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("applied");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const q = useQuery({
    queryKey: ["roles", scope],
    queryFn: () => api.roles({ scope }),
  });

  const rows = useMemo(() => {
    const all = q.data?.data ?? [];
    const s = search.trim().toLowerCase();
    const filtered = s
      ? all.filter((r) =>
          [r.title, r.hiring_manager, r.location].some((x) =>
            (x ?? "").toString().toLowerCase().includes(s),
          ),
        )
      : all;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [q.data, search, sortKey, sortDir]);

  function sortOn(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-h1 tracking-tight">Roles</h1>
          <p className="mt-1 text-body text-ink-3">Which roles need attention?</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="h-9 rounded-md border border-hairline bg-paper px-3 text-body placeholder:text-ink-3"
            placeholder="Search role or hiring manager"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="h-9 rounded-md border border-hairline bg-paper px-2 text-body"
            value={scope}
            onChange={(e) => setScope(e.target.value as any)}
          >
            <option value="listed_open">Listed + open</option>
            <option value="all">All</option>
          </select>
          <a
            className="h-9 inline-flex items-center px-3 rounded-md border border-hairline text-body"
            href={`/api/roles?scope=${scope}`}
            download="roles.json"
          >
            Export
          </a>
        </div>
      </header>

      {/* desktop table */}
      <div className="hidden md:block card overflow-x-auto">
        <table className="w-full text-body">
          <thead className="text-caption text-ink-3 bg-paper-2 sticky top-0">
            <tr className="text-left">
              <Th k="title" label="Role" onSort={sortOn} active={sortKey} dir={sortDir} />
              <Th k="days_open" label="Days open" numeric onSort={sortOn} active={sortKey} dir={sortDir} />
              <Th k="applied" label="Applied" numeric onSort={sortOn} active={sortKey} dir={sortDir} />
              <Th k="live" label="Live" numeric onSort={sortOn} active={sortKey} dir={sortDir} />
              <Th k="in_interview" label="Interviews" numeric onSort={sortOn} active={sortKey} dir={sortDir} />
              <Th k="offer" label="Offer" numeric onSort={sortOn} active={sortKey} dir={sortDir} />
              <Th k="rejected" label="Rejected" numeric onSort={sortOn} active={sortKey} dir={sortDir} />
              <Th k="status" label="Status" onSort={sortOn} active={sortKey} dir={sortDir} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.job_id} className="border-t border-hairline hover:bg-paper-2">
                <td className="py-2 px-4">
                  <Link to={`/roles/${r.job_id}`} className="hover:underline">{r.title}</Link>
                  {r.hiring_manager && (
                    <div className="mt-0.5">
                      <span className="chip-blue">{r.hiring_manager}</span>
                    </div>
                  )}
                </td>
                <td className={daysOpenClass(r.days_open)}>{fmtInt(r.days_open)}</td>
                <td className="py-2 px-4 text-right num tnum">{fmtInt(r.applied)}</td>
                <td className="py-2 px-4 text-right num tnum">{fmtInt(r.live)}</td>
                <td className="py-2 px-4 text-right num tnum">{fmtInt(r.in_interview)}</td>
                <td className="py-2 px-4 text-right num tnum">{fmtInt(r.offer)}</td>
                <td className="py-2 px-4 text-right num tnum text-ink-3">{fmtInt(r.rejected)}</td>
                <td className="py-2 px-4">
                  <StatusChip status={r.status} listed={r.is_listed} />
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-ink-3">No roles match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* mobile card list */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => (
          <Link
            key={r.job_id}
            to={`/roles/${r.job_id}`}
            className="block card p-3"
          >
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="font-medium text-body">{r.title}</div>
                {r.hiring_manager && (
                  <div className="mt-0.5"><span className="chip-blue">{r.hiring_manager}</span></div>
                )}
              </div>
              <StatusChip status={r.status} listed={r.is_listed} />
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1 text-center">
              <Stat label="Applied" value={r.applied} />
              <Stat label="Live" value={r.live} />
              <Stat label="Intvs" value={r.in_interview} />
              <Stat label="Offer" value={r.offer} />
              <Stat label="Rej" value={r.rejected} />
            </div>
            <div className="mt-1 text-caption text-ink-3">
              Open {fmtInt(r.days_open)}d · updated {fmtRelative(r.last_activity_at)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Th({
  k, label, onSort, active, dir, numeric,
}: {
  k: SortKey; label: string; onSort: (k: SortKey) => void; active: SortKey; dir: "asc" | "desc"; numeric?: boolean;
}) {
  const is = active === k;
  return (
    <th className={"py-2 px-4 font-medium " + (numeric ? "text-right num" : "")}>
      <button className="hover:text-ink" onClick={() => onSort(k)}>
        {label} {is ? (dir === "asc" ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}

function daysOpenClass(d: number | null): string {
  const base = "py-2 px-4 text-right num tabular-nums ";
  if (d == null) return base + "text-ink-3";
  if (d > 60) return base + "text-brand-orange-ink font-medium";
  return base;
}

function StatusChip({ status, listed }: { status: string; listed: boolean }) {
  if (status === "Open" && listed) return <span className="chip-green">Listed</span>;
  if (status === "Open") return <span className="chip-gray">Open (unlisted)</span>;
  if (status === "Archived") return <span className="chip-gray">Archived</span>;
  if (status === "Closed") return <span className="chip-gray">Closed</span>;
  return <span className="chip-gray">{status}</span>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-caption text-ink-3">{label}</div>
      <div className="text-body tabular-nums">{fmtInt(value)}</div>
    </div>
  );
}
