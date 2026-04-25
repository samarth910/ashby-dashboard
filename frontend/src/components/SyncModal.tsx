import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { api, type RefreshJob } from "@/lib/api";
import { fmtRelative } from "@/lib/format";

const ENTITY_LABEL: Record<string, string> = {
  jobs: "Jobs",
  job_postings: "Postings",
  openings: "Openings",
  candidates: "Candidates",
  applications: "Applications",
  offers: "Offers",
  archive_reasons: "Archive reasons",
  sources: "Sources",
  users: "Users",
  departments: "Departments",
  locations: "Locations",
  application_history: "Stage history",
};

const ENTITY_ORDER = [
  "jobs", "job_postings", "openings", "applications", "candidates",
  "offers", "users", "departments", "locations", "sources", "archive_reasons",
  "application_history",
];

export function SyncModal({
  open,
  onClose,
  initialJobId,
}: {
  open: boolean;
  onClose: () => void;
  initialJobId?: string | null;
}) {
  const qc = useQueryClient();
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJobId ?? null);

  const health = useQuery({
    queryKey: ["health-modal"],
    queryFn: api.health,
    enabled: open,
    refetchInterval: open ? 5_000 : false,
  });

  // Hydrate from /api/refresh (current-or-idle) when modal opens or no activeJobId yet
  const current = useQuery({
    queryKey: ["refresh-current-modal"],
    queryFn: () => fetch("/api/refresh").then((r) => r.json()) as Promise<RefreshJob | { status: "idle" }>,
    enabled: open,
    refetchInterval: open ? 4_000 : false,
  });

  useEffect(() => {
    const cur = current.data;
    if (cur && "id" in cur && cur.status === "running") {
      setActiveJobId(cur.id);
    }
  }, [current.data]);

  const job = useQuery({
    queryKey: ["refresh-job-modal", activeJobId],
    queryFn: () => api.refreshStatus(activeJobId!),
    enabled: !!activeJobId && open,
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && d.status === "running" ? 1500 : false;
    },
  });

  // refresh dashboard queries when a job completes
  useEffect(() => {
    const d = job.data;
    if (d && d.status !== "running") {
      qc.invalidateQueries();
    }
  }, [job.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const startMut = useMutation({
    mutationFn: (full: boolean) => api.refreshStart(full),
    onSuccess: (d) => setActiveJobId(d.jobId),
  });

  const isRunning = job.data?.status === "running" || startMut.isPending;
  const lastSync = health.data?.sync.lastRunCompletedAt ?? null;
  const lastKind = health.data?.sync.lastRunKind ?? null;
  const lastDur = health.data?.sync.lastRunDurationSec ?? null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed top-0 right-0 z-50 h-full w-full sm:max-w-[520px] bg-paper shadow-float flex flex-col"
            initial={{ x: 540 }}
            animate={{ x: 0 }}
            exit={{ x: 540 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            role="dialog"
            aria-label="Sync controls"
          >
            <header className="px-5 py-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h2 className="font-display text-h3">Data sync</h2>
                <p className="text-caption text-ink-3">
                  Last synced {fmtRelative(lastSync)}
                  {lastKind && lastDur != null ? ` · ${lastKind} in ${lastDur}s` : ""}
                </p>
              </div>
              <button onClick={onClose} className="p-1 rounded-md hover:bg-paper-2" aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <section className="px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-hairline">
              <button
                disabled={isRunning}
                onClick={() => startMut.mutate(true)}
                className="rounded-md bg-ink text-paper px-3 py-2 text-body inline-flex items-center justify-center gap-2 disabled:opacity-50"
                title="First-time analysis: full sync from scratch"
              >
                <Play size={14} />
                Run first analysis
              </button>
              <button
                disabled={isRunning}
                onClick={() => startMut.mutate(false)}
                className="rounded-md border border-hairline px-3 py-2 text-body inline-flex items-center justify-center gap-2 disabled:opacity-50"
                title="Periodic sync: incremental fetch of recent changes"
              >
                <RefreshCw size={14} />
                Sync now
              </button>
              <button
                disabled={isRunning}
                onClick={() => startMut.mutate(true)}
                className="rounded-md border border-hairline px-3 py-2 text-body inline-flex items-center justify-center gap-2 disabled:opacity-50"
                title="Force full resync (ignores sync tokens)"
              >
                <AlertTriangle size={14} />
                Force full resync
              </button>
            </section>
            <p className="px-5 pt-2 pb-1 text-caption text-ink-3">
              Auto-sync runs every 4h on Railway. Force only if a token expired or schema drifted.
            </p>

            <section className="flex-1 overflow-hidden flex flex-col">
              <ProgressList job={job.data ?? null} />
              <LogStream logs={job.data?.logs ?? []} running={isRunning} />
            </section>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ProgressList({ job }: { job: RefreshJob | null }) {
  if (!job) {
    return (
      <div className="px-5 py-4 text-small text-ink-3">
        No active sync. Click <span className="font-medium text-ink">Sync now</span> to start one.
      </div>
    );
  }
  const entities = useMemo(() => {
    return ENTITY_ORDER.filter((k) => job.entities[k]).map((k) => ({
      name: k,
      label: ENTITY_LABEL[k] ?? k,
      ...job.entities[k],
    }));
  }, [job]);

  const overall = `${job.kind} · ${job.status} · ${Math.round(job.progress * 100)}%`;
  return (
    <div className="px-5 py-3 border-b border-hairline">
      <div className="flex items-center justify-between text-caption text-ink-3">
        <span>Job <span className="font-mono">{job.id}</span> — {overall}</span>
        {job.duration_sec != null && <span className="tnum">{job.duration_sec}s</span>}
      </div>
      <ul className="mt-3 space-y-1.5">
        {entities.map((e) => (
          <li key={e.name} className="flex items-center justify-between text-small">
            <div className="flex items-center gap-2">
              <StateIcon state={e.state} />
              <span className="text-ink">{e.label}</span>
            </div>
            <div className="text-ink-3 tnum">
              {e.state === "running" && e.pages > 0 && (
                <span>{e.pages}p · {e.fetched.toLocaleString()} rows</span>
              )}
              {e.state === "success" && (
                <span>
                  {e.fetched > 0 ? `${e.fetched.toLocaleString()} fetched · ` : ""}
                  {e.count.toLocaleString()} total · {e.duration_sec ?? "?"}s
                </span>
              )}
              {e.state === "failed" && <span className="text-brand-orange-ink">{e.error}</span>}
              {e.state === "pending" && <span>—</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StateIcon({ state }: { state: string }) {
  if (state === "running") return <Loader2 size={14} className="animate-spin text-brand-blue" />;
  if (state === "success") return <CheckCircle2 size={14} className="text-stage-hired" />;
  if (state === "failed") return <AlertTriangle size={14} className="text-brand-orange-ink" />;
  return <span className="h-3.5 w-3.5 rounded-full border border-hairline inline-block" />;
}

function LogStream({ logs, running }: { logs: { ts: string; level: string; msg: string }[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-5 py-2 text-caption text-ink-3 flex items-center justify-between border-b border-hairline">
        <span>Activity log</span>
        {running && <span className="text-brand-blue inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> live</span>}
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto px-5 py-2 font-mono text-caption space-y-1">
        {logs.length === 0 && (
          <div className="text-ink-3">No log lines yet.</div>
        )}
        {logs.map((l, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-ink-3 tnum shrink-0">{shortTime(l.ts)}</span>
            <span
              className={
                l.level === "error" ? "text-brand-orange-ink" : l.level === "warn" ? "text-brand-orange" : "text-ink-2"
              }
            >
              {l.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}
