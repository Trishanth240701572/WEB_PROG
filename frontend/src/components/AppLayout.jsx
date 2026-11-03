import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  UsersRound,
  X,
} from "lucide-react";
import { api, path } from "../services/api.js";
import { useWorkspace } from "../context.jsx";
import { weekLabel } from "../utils/dates.js";
import { Avatar, WeekNavigator } from "./UI.jsx";

export const staffNavigation = [
  ["/overview", "Overview", LayoutDashboard],
  ["/roster", "Weekly roster", CalendarDays],
  ["/my-shifts", "My shifts", Clock3],
  ["/swaps", "Swap centre", ArrowLeftRight],
  ["/summary", "My summary", ChartNoAxesCombined],
];
export const supervisorNavigation = [
  ["/overview", "Overview", LayoutDashboard],
  ["/manage/roster", "Roster builder", CalendarDays],
  ["/manage/approvals", "Approval inbox", ClipboardCheck],
  ["/manage/staff", "Staff directory", UsersRound],
  ["/manage/reports", "Reports", ChartNoAxesCombined],
];
const titles = {
  "/overview": ["Overview", "A clear view of the week ahead."],
  "/roster": ["Weekly roster", "The published plan for your lab team."],
  "/my-shifts": [
    "My shifts",
    "Your duties, dates, and the details that matter.",
  ],
  "/swaps": ["Swap centre", "Thoughtful exchanges. Clear decisions."],
  "/swaps/new": [
    "Request an exchange",
    "Find a suitable duty, with both sides checked.",
  ],
  "/summary": ["My summary", "Your scheduled hours and exchange history."],
  "/notifications": [
    "Notifications",
    "Saved updates from your team’s schedule.",
  ],
  "/manage/roster": [
    "Roster builder",
    "Plan the week. Close every coverage gap.",
  ],
  "/manage/approvals": [
    "Approval inbox",
    "Review both sides before the schedule changes.",
  ],
  "/manage/staff": [
    "Staff directory",
    "The people supporting your laboratories.",
  ],
  "/manage/reports": [
    "Reports",
    "Scheduled workload and coverage, in one place.",
  ],
};

export default function AppLayout({ children }) {
  const { data, week, setWeek, refresh, meta, refreshing } = useWorkspace();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const focusRef = useRef(null);
  const currentPath = useRef(location.pathname);
  currentPath.current = location.pathname;
  const isSupervisor = data.user.role === "supervisor";
  const [title, subtitle] = titles[location.pathname] || [
    "Exchange details",
    "Follow the request, checks, and saved decision.",
  ];
  const unread = data.notifications.filter((notice) => !notice.readAt).length;
  const detailRequest = location.pathname.startsWith("/swaps/")
    ? data.swaps.find(
        (request) => request.id === location.pathname.split("/").at(-1),
      )
    : null;
  useEffect(() => {
    document.title = `${title} · ShiftSync`;
    setMenu(false);
    focusRef.current?.focus({ preventScroll: true });
  }, [location.pathname, title]);
  useEffect(() => {
    if (!menu) return undefined;
    const sidebar = document.querySelector(".sidebar");
    const workspace = document.querySelector(".workspace");
    const previous = document.activeElement;
    const openedAt = location.pathname;
    workspace.inert = true;
    sidebar.querySelector("a")?.focus();
    function keyboard(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(false);
      }
      if (event.key !== "Tab") return;
      const items = [
        ...sidebar.querySelectorAll("a[href],button:not([disabled])"),
      ].filter((item) => item.getClientRects().length);
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      workspace.inert = false;
      document.removeEventListener("keydown", keyboard);
      if (currentPath.current === openedAt && previous?.isConnected)
        previous.focus();
    };
  }, [menu]);
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await api("logout", { body: {} });
      window.location.assign(path("/login.php"));
    } catch (error) {
      setLogoutError(error.message);
      setLoggingOut(false);
    }
  }
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside
        className={`sidebar ${menu ? "sidebar-open" : ""}`}
        aria-label="Application navigation"
        role={menu ? "dialog" : undefined}
        aria-modal={menu ? true : undefined}
      >
        <Link to="/overview" className="brand">
          <img src={path("/assets/mark.svg")} width="34" height="34" alt="" />
          ShiftSync<span className="brand-period">.</span>
        </Link>
        <div className="workspace-caption">LAB SUPPORT WORKSPACE</div>
        <nav className="sidebar-nav">
          {(isSupervisor ? supervisorNavigation : staffNavigation).map(
            ([url, label, Icon]) => (
              <NavLink
                key={url}
                to={url}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
                {url === "/manage/approvals" &&
                  data.swaps.filter(
                    (swap) => swap.status === "awaiting_supervisor",
                  ).length > 0 && (
                    <span className="nav-count">
                      {
                        data.swaps.filter(
                          (swap) => swap.status === "awaiting_supervisor",
                        ).length
                      }
                    </span>
                  )}
              </NavLink>
            ),
          )}
          {!isSupervisor && (
            <a
              className="nav-item"
              href={path(`/availability.php?week=${week}`)}
            >
              <ClipboardCheck size={19} aria-hidden="true" />
              <span>My availability</span>
            </a>
          )}
          <div className="nav-divider" />
          <NavLink
            to="/notifications"
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Bell size={19} aria-hidden="true" />
            <span>Notifications</span>
            {unread > 0 && <span className="nav-count">{unread}</span>}
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="institution-note">
            <span className="institution-dot" />
            <span>
              College lab support<small>Asia/Kolkata · IST</small>
            </span>
          </div>
          <div className="user-chip">
            <Avatar name={data.user.name} />
            <div>
              <strong>{data.user.name}</strong>
              <span>
                {isSupervisor
                  ? "Supervisor"
                  : data.user.qualification === "technician"
                    ? "Technician · Staff"
                    : "Lab assistant · Staff"}
              </span>
            </div>
            <button
              className="icon-btn"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
          {logoutError && (
            <p className="field-error" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} aria-hidden="true" />
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <span className="live-status">
              <span />
              Saved on server
            </span>
            <Link
              className="icon-btn notification-button"
              to="/notifications"
              aria-label={`${unread} unread notifications`}
            >
              <Bell size={19} />
              {unread > 0 && <span className="unread-dot" />}
            </Link>
            <button
              className="icon-btn mobile-menu-button"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              aria-label={menu ? "Close navigation" : "Open navigation"}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="page-content">
          <div className="page-header">
            <div>
              <h1 ref={focusRef} tabIndex={-1} className="page-title">
                {title}
              </h1>
              <p className="page-subtitle">{subtitle}</p>
            </div>
            <div className="header-actions">
              {detailRequest ? (
                <div className="request-week-label">
                  <CalendarDays size={16} aria-hidden="true" />
                  <span>{weekLabel(detailRequest.week)}</span>
                </div>
              ) : (
                <WeekNavigator
                  week={week}
                  onChange={setWeek}
                  rosters={data.rosters}
                />
              )}
              <button
                className="icon-btn refresh-button"
                onClick={() => refresh()}
                disabled={refreshing}
                aria-label="Refresh saved records"
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </div>
          {children}
          <footer className="workspace-footer">
            <span>Scheduled duties · Asia/Kolkata (IST)</span>
            <span>
              {meta?.serverTime
                ? `Last updated ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(meta.serverTime))} IST`
                : "Updates every 15 seconds while visible"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
