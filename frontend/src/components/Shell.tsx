import { NavLink, Outlet, Link } from "react-router-dom";
import { LayoutDashboard, Grid3x3, Database } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import { SyncModal } from "./SyncModal";

const nav = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/funnel", label: "Per-round funnel", icon: Grid3x3, end: false },
];

export function Shell() {
  const [syncOpen, setSyncOpen] = useState(false);
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 30_000 });
  const isRunning = !!health.data?.sync.currentJobId;

  // auto-open the modal whenever a sync is in flight (so the user always sees progress)
  useEffect(() => {
    if (isRunning) setSyncOpen(true);
  }, [isRunning]);

  return (
    <div className="min-h-full flex flex-col bg-paper-2">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-sarvam-gradient" />
            <span className="font-display text-h3 tracking-tight">Sarvam Hiring</span>
          </Link>
          <SyncButton
            onClick={() => setSyncOpen(true)}
            running={isRunning}
            lastSync={health.data?.sync.lastRunCompletedAt ?? null}
          />
        </div>
        <nav className="hidden md:flex mx-auto max-w-[1400px] px-4 sm:px-6 pb-2 gap-1">
          {nav.map((n) => (
            <NavItem key={n.to} {...n} />
          ))}
        </nav>
      </header>

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-6 pb-24 md:pb-10">
        <Outlet />
      </main>

      {/* mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-hairline bg-paper/95 backdrop-blur">
        <div className="grid grid-cols-3 items-stretch">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  "flex flex-col items-center justify-center gap-1 py-2 text-caption",
                  isActive ? "text-ink" : "text-ink-3",
                ].join(" ")
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSyncOpen(true)}
            className="flex flex-col items-center justify-center gap-1 py-2 text-caption text-ink-3"
          >
            <Database size={18} />
            <span>Sync</span>
          </button>
        </div>
      </nav>

      <SyncModal open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof LayoutDashboard; end: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "flex items-center gap-2 rounded-md px-3 py-2 text-body transition-colors",
          isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
        ].join(" ")
      }
    >
      <Icon size={16} />
      <span>{label}</span>
    </NavLink>
  );
}

function SyncButton({ onClick, running, lastSync }: { onClick: () => void; running: boolean; lastSync: string | null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-body border border-hairline hover:bg-paper-2"
    >
      <Database size={14} className={running ? "text-brand-blue animate-pulse" : "text-ink-3"} />
      <span>{running ? "Sync running…" : "Sync"}</span>
      <span className="hidden sm:inline text-caption text-ink-3 ml-1">
        {lastSync ? `last ${fmtRelative(lastSync)}` : "never"}
      </span>
    </button>
  );
}
