import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { WorkspaceContext } from "./context.jsx";
import { useApi } from "./hooks/useApi.js";
import { path } from "./services/api.js";
import { localToday, mondayFor } from "./utils/dates.js";
import AppLayout from "./components/AppLayout.jsx";
import { EmptyState, ErrorState, Loading } from "./components/UI.jsx";
import RosterPage from "./components/Roster.jsx";
import SwapsPage, { NewSwapPage, SwapDetailPage } from "./pages/Swaps.jsx";
import {
  MyShiftsPage,
  NotificationsPage,
  OverviewPage,
  StaffDirectoryPage,
} from "./pages/WorkspacePages.jsx";
import ReportsPage from "./pages/Reports.jsx";

export default function App() {
  const bootstrap = useApi("bootstrap");
  const [week, setWeek] = useState("");
  const [expired, setExpired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const resourceRefreshers = useRef(new Map());
  const registerRefresh = useCallback((name, load) => {
    resourceRefreshers.current.set(name, load);
    return () => {
      if (resourceRefreshers.current.get(name) === load)
        resourceRefreshers.current.delete(name);
    };
  }, []);
  useEffect(() => {
    const expire = () => setExpired(true);
    window.addEventListener("shiftsync:session-expired", expire);
    return () =>
      window.removeEventListener("shiftsync:session-expired", expire);
  }, []);
  useEffect(() => {
    if (bootstrap.data && !week) {
      const today = localToday(bootstrap.meta.serverTime);
      const published = bootstrap.data.rosters
        .filter(
          (roster) =>
            roster.status === "published" && roster.week >= mondayFor(today),
        )
        .sort((a, b) => a.week.localeCompare(b.week));
      setWeek(
        published[0]?.week ||
          bootstrap.data.rosters
            .slice()
            .sort((a, b) => b.week.localeCompare(a.week))[0]?.week ||
          mondayFor(today),
      );
    }
  }, [bootstrap.data, bootstrap.meta, week]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !expired)
        bootstrap.refresh({ quiet: true, background: true, onlyIfIdle: true });
    }, 15000);
    return () => clearInterval(timer);
  }, [bootstrap.refresh, expired]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [response] = await Promise.all([
        bootstrap.refresh({ quiet: true }),
        ...[...resourceRefreshers.current.values()].map((load) =>
          load({ background: false }),
        ),
      ]);
      return response;
    } finally {
      setRefreshing(false);
    }
  }, [bootstrap.refresh]);
  if (expired || bootstrap.error?.status === 401)
    return (
      <main className="session-ended">
        <a className="brand" href={path("/index.php")}>
          <img alt="" width="36" height="36" src={path("/assets/mark.svg")} />
          ShiftSync.
        </a>
        <div className="panel panel-body">
          <h1>Your session has ended.</h1>
          <p>Sign in again to continue with the latest saved roster.</p>
          <a className="btn btn-primary" href={path("/login.php")}>
            Return to sign in
          </a>
        </div>
      </main>
    );
  if (!bootstrap.data || !week)
    return (
      <main className="app-initial-state">
        <div className="brand">
          <img alt="" src={path("/assets/mark.svg")} width="36" height="36" />
          ShiftSync.
        </div>
        {bootstrap.error ? (
          <ErrorState
            error={bootstrap.error}
            retry={() => bootstrap.refresh()}
          />
        ) : (
          <Loading />
        )}
      </main>
    );
  const supervisor = bootstrap.data.user.role === "supervisor";
  const protect = (element, requiresSupervisor) =>
    supervisor === requiresSupervisor ? (
      element
    ) : (
      <Navigate to="/overview" replace />
    );
  return (
    <WorkspaceContext.Provider
      value={{
        data: bootstrap.data,
        meta: bootstrap.meta,
        week,
        setWeek,
        refresh,
        refreshing,
        registerRefresh,
      }}
    >
      <AppLayout>
        {bootstrap.error && (
          <ErrorState error={bootstrap.error} retry={refresh} />
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/roster" element={<RosterPage />} />
          <Route path="/my-shifts" element={protect(<MyShiftsPage />, false)} />
          <Route path="/swaps" element={protect(<SwapsPage />, false)} />
          <Route path="/swaps/new" element={protect(<NewSwapPage />, false)} />
          <Route path="/swaps/:id" element={<SwapDetailPage />} />
          <Route
            path="/summary"
            element={protect(<ReportsPage personal />, false)}
          />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/manage/roster"
            element={protect(<RosterPage manage />, true)}
          />
          <Route
            path="/manage/staff"
            element={protect(<StaffDirectoryPage />, true)}
          />
          <Route
            path="/manage/approvals"
            element={protect(<SwapsPage supervisor />, true)}
          />
          <Route
            path="/manage/reports"
            element={protect(<ReportsPage />, true)}
          />
          <Route
            path="*"
            element={
              <EmptyState
                title="This view could not be found"
                action={
                  <Link className="btn btn-secondary" to="/overview">
                    Go to overview
                  </Link>
                }
              >
                Use the workspace navigation to continue.
              </EmptyState>
            }
          />
        </Routes>
      </AppLayout>
    </WorkspaceContext.Provider>
  );
}
