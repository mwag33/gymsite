import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useActiveGym } from "../contexts/ActiveGymContext";
import {
  HomeIcon,
  LogIcon,
  ProgressIcon,
  GymIcon,
  ProfileIcon,
} from "./icons";
import type { ComponentType, SVGProps } from "react";

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  { to: "/", label: "Plan", icon: HomeIcon },
  { to: "/log", label: "Log", icon: LogIcon },
  { to: "/progress", label: "Progress", icon: ProgressIcon },
  { to: "/gym", label: "Gym", icon: GymIcon },
  { to: "/profile", label: "Profile", icon: ProfileIcon },
];

export function AppShell() {
  const { activeGym } = useActiveGym();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <nav className="shell-tabbar" aria-label="Primary">
        {NAV_ITEMS.map(({ to, label, icon: ItemIcon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              "shell-tab" + (isActive ? " shell-tab-active" : "")
            }
          >
            <ItemIcon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="shell-main">
        <header className="shell-topbar">
          <button
            type="button"
            className="shell-gym-indicator"
            onClick={() => navigate("/gym")}
          >
            <GymIcon width={16} height={16} />
            <span>{activeGym ? activeGym.name : "Choose a gym"}</span>
          </button>
        </header>

        <main className="shell-content">
          <Outlet />
        </main>
      </div>

      <style>{`
        .shell {
          display: flex;
          flex-direction: column;
          min-height: 100dvh;
          max-width: var(--shell-max-width);
          margin: 0 auto;
          background: var(--bg);
        }
        .shell-main {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }
        .shell-topbar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          padding: var(--space-3) var(--space-4);
          background: var(--bg);
          border-bottom: 1px solid var(--border);
        }
        .shell-gym-indicator {
          display: inline-flex;
          align-items: center;
          gap: var(--space-2);
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }
        .shell-content {
          flex: 1;
          padding: var(--space-4);
          padding-bottom: calc(var(--tab-bar-height) + var(--space-5));
        }
        .shell-tabbar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          max-width: var(--shell-max-width);
          margin: 0 auto;
          height: var(--tab-bar-height);
          display: flex;
          background: var(--surface);
          border-top: 1px solid var(--border);
        }
        .shell-tab {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          font-size: 11px;
          color: var(--text-muted);
          text-decoration: none;
        }
        .shell-tab-active {
          color: var(--accent);
        }

        @media (min-width: 1024px) {
          .shell {
            max-width: none;
            flex-direction: row;
          }
          .shell-topbar {
            position: static;
          }
          .shell-tabbar {
            position: static;
            flex-direction: column;
            width: 220px;
            flex-shrink: 0;
            height: auto;
            min-height: 100dvh;
            border-top: none;
            border-right: 1px solid var(--border);
            padding: var(--space-5) var(--space-3);
            gap: var(--space-2);
          }
          .shell-tab {
            flex-direction: row;
            justify-content: flex-start;
            gap: var(--space-3);
            padding: var(--space-3);
            border-radius: var(--radius-md);
            font-size: 15px;
          }
          .shell-tab-active {
            background: var(--surface-raised);
          }
          .shell-content {
            padding-bottom: var(--space-5);
            max-width: 720px;
            width: 100%;
            margin: 0 auto;
          }
        }
      `}</style>
    </div>
  );
}
