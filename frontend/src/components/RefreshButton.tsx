import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/format";

export function RefreshButton() {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);

  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });

  const job = useQuery({
    queryKey: ["refresh", jobId],
    queryFn: () => api.refreshStatus(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => {
      const data = q.state.data;
      return data && data.status === "running" ? 1500 : false;
    },
  });

  const start = useMutation({
    mutationFn: () => api.refreshStart(false),
    onSuccess: (d) => setJobId(d.jobId),
  });

  // Once a running job completes, invalidate dashboard queries
  useEffect(() => {
    if (job.data && job.data.status !== "running") {
      qc.invalidateQueries();
    }
  }, [job.data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const isRunning = job.data?.status === "running" || start.isPending;
  const progress = job.data?.progress ?? 0;

  return (
    <div className="flex items-center gap-3">
      <div className="hidden sm:flex flex-col items-end text-caption text-ink-3">
        <span>Last synced {fmtRelative(health.data?.sync.lastRunCompletedAt)}</span>
        {health.data?.sync.lastRunDurationSec != null && (
          <span>{health.data.sync.lastRunDurationSec}s</span>
        )}
      </div>
      <motion.button
        type="button"
        onClick={() => !isRunning && start.mutate()}
        className="relative inline-flex items-center gap-2 rounded-md px-4 py-2 text-body font-medium text-paper bg-ink overflow-hidden disabled:opacity-50"
        whileTap={{ scale: 0.98 }}
        disabled={isRunning}
      >
        <AnimatePresence>
          {isRunning && (
            <motion.div
              className="absolute inset-y-0 left-0 bg-brand-blue/60"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(8, progress * 100)}%` }}
              exit={{ width: "100%", opacity: 0 }}
              transition={{ duration: 0.35 }}
            />
          )}
        </AnimatePresence>
        <RefreshCw size={14} className={isRunning ? "animate-spin relative" : "relative"} />
        <span className="relative">{isRunning ? `Refreshing… ${Math.round(progress * 100)}%` : "Refresh now"}</span>
      </motion.button>
    </div>
  );
}
