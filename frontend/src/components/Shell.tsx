import { NavLink, Outlet, Link } from "react-router-dom";
import { LayoutDashboard, Briefcase, Activity, Radio, Users, Settings, ListOrdered } from "lucide-react";
import { RefreshButton } from "./RefreshButton";
import type { ReactNode } from "react";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/pipeline", label: "Pipeline", icon: ListOrdered, end: false },
  { to: "/roles", label: "Roles", icon: Briefcase, end: false },
  { to: "/velocity", label: "Velocity", icon: Activity, end: false },
  { to: "/sources", label: "Sources", icon: Radio, end: false },
  { to: "/people", label: "People", icon: Users, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof LayoutDashboard; end: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "group flex items-center gap-2 rounded-md px-3 py-2 text-body transition-colors",
          isActive ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2",
        ].join(" ")
      }
    >
      {({ isActive }: { isActive: boolean }): ReactNode => (
        <>
          <Icon size={16} className={isActive ? "" : "text-ink-3"} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Shell() {
  return (
    <div className="min-h-full flex flex-col bg-paper-2">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-[1400px] px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-md bg-sarvam-gradient" />
            <span className="font-display text-h3 tracking-tight">Sarvam Hiring</span>
          </Link>
          <RefreshButton />
        </div>
        {/* desktop nav row */}
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
        <div className="grid grid-cols-5 items-stretch">
          {nav.slice(0, 5).map(({ to, label, icon: Icon, end }) => (
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
        </div>
      </nav>
    </div>
  );
}
