import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useWorkspace } from "../context.jsx";
import { api, path } from "../services/api.js";
import {
  dateTime,
  formatDate,
  formatTime,
  hoursFor,
  isPending,
  labName,
} from "../utils/dates.js";
import {
  Avatar,
  Badge,
  DataTable,
  EmptyState,
  Feedback,
  FieldErrors,
  NextShiftCountdown,
  Panel,
} from "../components/UI.jsx";
import {
  CoverageTable,
  ShiftDrawer,
  coverageFor,
} from "../components/Roster.jsx";

export function OverviewPage() {
  const { data, week, meta } = useWorkspace();
  const supervisor = data.user.role === "supervisor";
  const roster = data.rosters.find((item) => item.week === week);
  const slots = data.slots.filter((slot) => slot.rosterId === roster?.id);
  const own = data.assignments.filter(
    (assignment) =>
      assignment.staffId === data.user.id &&
      slots.some((slot) => slot.id === assignment.slotId),
  );
  const upcoming = data.assignments
    .filter((assignment) => assignment.staffId === data.user.id)
    .map((assignment) => ({
      assignment,
      slot: data.slots.find((slot) => slot.id === assignment.slotId),
    }))
    .filter(
      ({ slot }) =>
        slot && Date.parse(slot.startsAt) > Date.parse(meta.serverTime),
    )
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
  const next = upcoming[0];
  const coverage = slots.map((slot) =>
    coverageFor(slot, data.assignments, data.users),
  );
  const covered = coverage.filter(
    (row) => row.missingPeople === 0 && row.missingTechnicians === 0,
  ).length;
  const missingPeople = coverage.reduce(
    (sum, row) => sum + row.missingPeople,
    0,
  );
  const missingTechnicians = coverage.reduce(
    (sum, row) => sum + row.missingTechnicians,
    0,
  );
  const pending = data.swaps.filter((swap) =>
    supervisor
      ? swap.status === "awaiting_supervisor"
      : isPending(swap.status) &&
        [swap.requesterId, swap.recipientId].includes(data.user.id),
  );
  const [selection, setSelection] = useState(null);
  return (
    <>
      <div className="overview-welcome">
        <div>
          <p className="welcome-context">
            {supervisor ? "THE WEEK, IN FOCUS" : "YOUR WEEK, IN FOCUS"}
          </p>
          <h2>
            {supervisor
              ? "A good week starts with a clear plan."
              : `Good to see you, ${data.user.name.split(" ")[0]}.`}
          </h2>
          <p>
            {supervisor
              ? "Every lab, every block, and the right people in place."
              : "Your next duty and the team’s latest updates, all together."}
          </p>
        </div>
        <Link
          className="btn btn-primary"
          to={supervisor ? "/manage/roster" : "/roster"}
        >
          <CalendarDays size={17} />
          {supervisor ? "Open roster builder" : "View team roster"}
          <ArrowRight size={16} />
        </Link>
      </div>
      <div className="metric-strip">
        {supervisor ? (
          <>
            <div>
              <span>Blocks covered</span>
              <strong>
                {covered}
                <small> / {slots.length}</small>
              </strong>
              <p>
                {roster
                  ? roster.status === "draft"
                    ? "Draft planning coverage"
                    : "Published coverage"
                  : "No roster this week"}
              </p>
            </div>
            <div>
              <span>People missing</span>
              <strong>{missingPeople}</strong>
              <p>Headcount positions to fill</p>
            </div>
            <div>
              <span>Technicians missing</span>
              <strong>{missingTechnicians}</strong>
              <p>Qualification requirements to fill</p>
            </div>
            <div>
              <span>Awaiting approval</span>
              <strong>{pending.length}</strong>
              <p>Accepted exchange requests</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>Scheduled this week</span>
              <strong>
                {own.reduce(
                  (sum, assignment) =>
                    sum +
                    hoursFor(
                      slots.find((slot) => slot.id === assignment.slotId),
                    ),
                  0,
                )}
                <small> hours</small>
              </strong>
              <p>Published scheduled hours</p>
            </div>
            <div>
              <span>Assigned duties</span>
              <strong>{own.length}</strong>
              <p>Selected roster week</p>
            </div>
            <div>
              <span>Pending exchanges</span>
              <strong>{pending.length}</strong>
              <p>Waiting for a response or decision</p>
            </div>
            <div>
              <span>Unread updates</span>
              <strong>
                {data.notifications.filter((notice) => !notice.readAt).length}
              </strong>
              <p>Saved in your inbox</p>
            </div>
          </>
        )}
      </div>
      {supervisor ? (
        <div className="overview-grid">
          <Panel
            title="Coverage at a glance"
            description={
              roster
                ? "People and technicians are checked independently."
                : "Select a saved week or create a new draft."
            }
            action={
              <Link className="text-link" to="/manage/roster">
                Review roster
                <ArrowRight size={15} />
              </Link>
            }
          >
            {coverage.length ? (
              <>
                <div className="coverage-progress-head">
                  <span>
                    {covered} of {slots.length} blocks meet requirements
                  </span>
                  <Badge
                    status={
                      missingPeople || missingTechnicians ? "gap" : "covered"
                    }
                  >
                    {missingPeople || missingTechnicians
                      ? "Gaps to resolve"
                      : "Fully covered"}
                  </Badge>
                </div>
                <div
                  className="coverage-progress"
                  role="progressbar"
                  aria-label="Duty blocks fully covered"
                  aria-valuemin={0}
                  aria-valuemax={slots.length}
                  aria-valuenow={covered}
                >
                  <span
                    style={{
                      width: `${slots.length ? (covered / slots.length) * 100 : 0}%`,
                    }}
                  />
                </div>
                <CoverageTable
                  rows={coverage
                    .filter(
                      (row) => row.missingPeople || row.missingTechnicians,
                    )
                    .slice(0, 5)}
                />
              </>
            ) : (
              <EmptyState
                title="No roster for this week"
                icon={CalendarDays}
                action={
                  <Link className="btn btn-secondary" to="/manage/roster">
                    Create a draft
                  </Link>
                }
              >
                A new draft creates all weekday blocks for both laboratories.
              </EmptyState>
            )}
          </Panel>
          <Panel
            title="Approval queue"
            action={
              <Link className="text-link" to="/manage/approvals">
                View all
                <ArrowRight size={15} />
              </Link>
            }
          >
            {pending.length ? (
              <div className="compact-list">
                {pending.slice(0, 4).map((swap) => (
                  <Link
                    className="compact-list-row"
                    to={`/swaps/${swap.id}`}
                    key={swap.id}
                  >
                    <span className="exchange-symbol">
                      <ArrowLeftRight size={18} />
                    </span>
                    <span>
                      <strong>
                        {
                          data.users.find(
                            (user) => user.id === swap.requesterId,
                          )?.name
                        }
                      </strong>
                      <small>
                        with{" "}
                        {
                          data.users.find(
                            (user) => user.id === swap.recipientId,
                          )?.name
                        }
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState title="You’re up to date" icon={CheckCircle2}>
                Accepted exchanges will appear here, ready for review.
              </EmptyState>
            )}
          </Panel>
        </div>
      ) : (
        <div className="overview-grid">
          <Panel
            title="Your next duty"
            action={
              <Link className="text-link" to="/my-shifts">
                All my shifts
                <ArrowRight size={15} />
              </Link>
            }
          >
            {next ? (
              <div className="next-duty">
                <div className="date-tile">
                  <span>
                    {formatDate(next.slot.date, {
                      month: "short",
                      day: undefined,
                    })}
                  </span>
                  <strong>{next.slot.date.slice(-2)}</strong>
                  <small>
                    {formatDate(next.slot.date, {
                      weekday: "short",
                      day: undefined,
                      month: undefined,
                    })}
                  </small>
                </div>
                <div className="next-duty-content">
                  <span
                    className={`lab-label ${next.slot.lab === "lab-b" ? "lab-label-b" : ""}`}
                  >
                    {labName(next.slot.lab)}
                  </span>
                  <h3>
                    {formatTime(next.slot.startsAt)}–
                    {formatTime(next.slot.endsAt)} <small>IST</small>
                  </h3>
                  <p>
                    {hoursFor(next.slot)} scheduled hours ·{" "}
                    {data.user.qualification === "technician"
                      ? "Technician"
                      : "Lab support"}
                  </p>
                  <NextShiftCountdown
                    target={next.slot.startsAt}
                    serverTime={meta.serverTime}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => setSelection(next)}
                  >
                    View duty details
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState title="No upcoming duties" icon={CalendarDays}>
                Your future published assignments will appear here.
              </EmptyState>
            )}
          </Panel>
          <Panel title="Plan ahead">
            <div className="quick-actions">
              <a href={path(`/availability.php?week=${week}`)}>
                <span className="quick-action-icon">
                  <ClipboardCheck size={20} />
                </span>
                <span>
                  <strong>Set your availability</strong>
                  <small>Help your supervisor plan the week.</small>
                </span>
                <ArrowRight size={17} />
              </a>
              <Link to="/swaps">
                <span className="quick-action-icon">
                  <ArrowLeftRight size={20} />
                </span>
                <span>
                  <strong>Visit the swap centre</strong>
                  <small>Review requests and find eligible exchanges.</small>
                </span>
                <ArrowRight size={17} />
              </Link>
              <Link to="/summary">
                <span className="quick-action-icon">
                  <Clock3 size={20} />
                </span>
                <span>
                  <strong>Review scheduled hours</strong>
                  <small>Your personal weekly summary.</small>
                </span>
                <ArrowRight size={17} />
              </Link>
            </div>
          </Panel>
        </div>
      )}
      <div className="overview-grid">
        <Panel
          title={supervisor ? "Recent saved changes" : "Recent updates"}
          action={
            <Link className="text-link" to="/notifications">
              Notifications
              <ArrowRight size={15} />
            </Link>
          }
        >
          {supervisor ? (
            <div className="activity-list">
              {(data.audit || [])
                .slice()
                .reverse()
                .slice(0, 5)
                .map((entry, index) => (
                  <div className="activity-row" key={entry.id || index}>
                    <span className="activity-dot" />
                    <div>
                      <strong>
                        {String(
                          entry.action || entry.type || "Schedule updated",
                        )
                          .replaceAll("_", " ")
                          .replaceAll(".", " · ")}
                      </strong>
                      <small>
                        {dateTime(entry.at || entry.createdAt)} IST
                        {entry.actorId &&
                          ` · ${data.users.find((user) => user.id === entry.actorId)?.name || "System"}`}
                      </small>
                    </div>
                  </div>
                ))}
              {!(data.audit || []).length && (
                <EmptyState title="No saved changes yet" icon={Clock3}>
                  Actual roster and exchange changes appear here.
                </EmptyState>
              )}
            </div>
          ) : (
            <NotificationList
              notices={data.notifications
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .slice(0, 4)}
              compact
            />
          )}
        </Panel>
        <div className="planning-note">
          <div className="planning-note-icon">
            <ShieldCheck size={24} aria-hidden="true" />
          </div>
          <h3>
            {supervisor
              ? "Coverage means the whole team."
              : "A fair exchange, checked both ways."}
          </h3>
          <p>
            {supervisor
              ? "A full headcount is only half the check. Every duty block also needs its required technician coverage before you can publish."
              : "Both people must be available for their incoming duty. The exchange also preserves the technician coverage of both labs."}
          </p>
          <Link
            className="text-link"
            to={supervisor ? "/manage/reports" : "/swaps/new"}
          >
            {supervisor
              ? "Explore coverage reports"
              : "Find an eligible exchange"}
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>
      {selection && (
        <ShiftDrawer
          slot={selection.slot}
          assignment={selection.assignment}
          onClose={() => setSelection(null)}
        />
      )}
    </>
  );
}

export function MyShiftsPage() {
  const { data, week, meta } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [lab, setLab] = useState("all");
  const [selection, setSelection] = useState(null);
  const rows = data.assignments
    .filter((assignment) => assignment.staffId === data.user.id)
    .map((assignment) => ({
      ...assignment,
      slot: data.slots.find((slot) => slot.id === assignment.slotId),
    }))
    .filter(
      ({ slot }) =>
        slot &&
        data.rosters.find((roster) => roster.id === slot.rosterId)?.week ===
          week &&
        (lab === "all" || lab === slot.lab) &&
        (filter === "all" ||
          (filter === "upcoming") ===
            Date.parse(slot.startsAt) > Date.parse(meta.serverTime)),
    )
    .sort((a, b) => a.slot.startsAt.localeCompare(b.slot.startsAt));
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Your assigned duties</h2>
          <p>
            {rows.length} duties ·{" "}
            {rows.reduce((sum, row) => sum + hoursFor(row.slot), 0)} scheduled
            hours in this scope
          </p>
        </div>
        <div className="inline-actions">
          <label className="visually-hidden" htmlFor="duty-status">
            Duty date filter
          </label>
          <select
            className="form-select compact-select"
            id="duty-status"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All duties</option>
            <option value="upcoming">Upcoming</option>
            <option value="started">Started / past</option>
          </select>
          <label className="visually-hidden" htmlFor="duty-lab">
            Duty laboratory filter
          </label>
          <select
            className="form-select compact-select"
            id="duty-lab"
            value={lab}
            onChange={(event) => setLab(event.target.value)}
          >
            <option value="all">All laboratories</option>
            <option value="lab-a">Lab A</option>
            <option value="lab-b">Lab B</option>
          </select>
        </div>
      </div>
      {rows.length ? (
        <div className="my-shift-list">
          {rows.map((assignment) => (
            <button
              className="my-shift-row"
              key={assignment.id}
              onClick={() => setSelection(assignment)}
            >
              <div className="date-tile date-tile-small">
                <span>
                  {formatDate(assignment.slot.date, {
                    weekday: "short",
                    day: undefined,
                    month: undefined,
                  })}
                </span>
                <strong>{assignment.slot.date.slice(-2)}</strong>
              </div>
              <div>
                <strong>
                  {formatDate(assignment.slot.date, {
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <span>
                  {formatTime(assignment.slot.startsAt)}–
                  {formatTime(assignment.slot.endsAt)} IST ·{" "}
                  {hoursFor(assignment.slot)} scheduled hours
                </span>
              </div>
              <span
                className={`lab-label ${assignment.slot.lab === "lab-b" ? "lab-label-b" : ""}`}
              >
                {labName(assignment.slot.lab)}
              </span>
              <Badge
                status={
                  Date.parse(assignment.slot.startsAt) >
                  Date.parse(meta.serverTime)
                    ? "published"
                    : "past"
                }
              >
                {Date.parse(assignment.slot.startsAt) >
                Date.parse(meta.serverTime)
                  ? "Upcoming"
                  : "Started / past"}
              </Badge>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title="No duties match this view" icon={CalendarDays}>
          Try a different week, laboratory, or date filter.
        </EmptyState>
      )}
      {selection && (
        <ShiftDrawer
          slot={selection.slot}
          assignment={selection}
          onClose={() => setSelection(null)}
        />
      )}
    </section>
  );
}

export function StaffDirectoryPage() {
  const { data } = useWorkspace();
  const [query, setQuery] = useState("");
  const [qualification, setQualification] = useState("all");
  const staff = data.users.filter(
    (user) =>
      user.role === "staff" &&
      user.name.toLowerCase().includes(query.toLowerCase()) &&
      (qualification === "all" || user.qualification === qualification),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Lab support team</h2>
          <p>
            {
              data.users.filter((user) => user.role === "staff" && user.active)
                .length
            }{" "}
            active staff · qualifications support coverage planning
          </p>
        </div>
        <div className="inline-actions">
          <label className="visually-hidden" htmlFor="staff-search">
            Search staff names
          </label>
          <input
            className="form-control search-field"
            id="staff-search"
            type="search"
            placeholder="Search names"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <label className="visually-hidden" htmlFor="staff-qualification">
            Filter qualification
          </label>
          <select
            className="form-select compact-select"
            id="staff-qualification"
            value={qualification}
            onChange={(event) => setQualification(event.target.value)}
          >
            <option value="all">All qualifications</option>
            <option value="technician">Technicians</option>
            <option value="assistant">Lab assistants</option>
          </select>
        </div>
      </div>
      <DataTable
        caption="Read-only staff operational directory"
        rows={staff}
        columns={[
          {
            key: "name",
            label: "Team member",
            render: (user) => (
              <div className="staff-cell">
                <Avatar name={user.name} small />
                <strong>{user.name}</strong>
              </div>
            ),
          },
          {
            key: "qualification",
            label: "Qualification",
            render: (user) => (
              <span className="qualification">
                {user.qualification === "technician" && (
                  <ShieldCheck size={15} />
                )}
                {user.qualification === "technician"
                  ? "Technician"
                  : "Lab assistant"}
              </span>
            ),
          },
          { key: "role", label: "Application role", render: () => "Staff" },
          {
            key: "active",
            label: "Account status",
            render: (user) => (
              <Badge status={user.active ? "eligible" : "inactive"}>
                {user.active ? "Active" : "Inactive"}
              </Badge>
            ),
          },
        ]}
      />
      <div className="panel-foot muted">
        Read-only operational profiles. The supervisor account is not assigned
        laboratory duties.
      </div>
    </section>
  );
}

export function NotificationList({ notices, compact = false, onRead }) {
  if (!notices.length)
    return (
      <EmptyState title="You’re all caught up" icon={Bell}>
        Saved roster and exchange updates will appear here.
      </EmptyState>
    );
  return (
    <div
      className={`notification-list ${compact ? "notification-list-compact" : ""}`}
    >
      {notices.map((notice) => (
        <article
          className={`notification-row ${notice.readAt ? "" : "notification-unread"}`}
          key={notice.id}
        >
          <span className="notification-icon">
            <Bell size={17} aria-hidden="true" />
          </span>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
            <small>{dateTime(notice.createdAt)} IST</small>
            <div className="inline-actions">
              <Link
                className="text-link"
                to={notice.swapId ? `/swaps/${notice.swapId}` : "/roster"}
                onClick={() => onRead?.(notice.id)}
              >
                Open details
                <ArrowRight size={13} />
              </Link>
              {!compact && !notice.readAt && (
                <button
                  className="btn btn-quiet"
                  onClick={() => onRead?.(notice.id)}
                >
                  Mark as read
                </button>
              )}
            </div>
          </div>
          {!notice.readAt && (
            <span className="unread-dot" aria-label="Unread" />
          )}
        </article>
      ))}
    </div>
  );
}
export function NotificationsPage() {
  const { data, refresh } = useWorkspace();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  async function read(id) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api("notification.read", { body: id ? { id } : { all: true } });
      await refresh();
      if (!id) setMessage("All saved notifications marked as read.");
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  const unread = data.notifications.filter((notice) => !notice.readAt).length;
  const notices = data.notifications
    .filter((notice) => filter !== "unread" || !notice.readAt)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <FieldErrors error={error} />
      <Feedback message={message} />
      <Panel
        title="Your saved updates"
        description={`${unread} unread notifications`}
        action={
          <button
            className="btn btn-secondary"
            disabled={busy || !unread}
            onClick={() => read()}
          >
            <CheckCircle2 size={16} />
            Mark all read
          </button>
        }
      >
        <div className="notification-toolbar">
          <div className="segmented-control">
            <button
              className={filter === "all" ? "active" : ""}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All updates
            </button>
            <button
              className={filter === "unread" ? "active" : ""}
              aria-pressed={filter === "unread"}
              onClick={() => setFilter("unread")}
            >
              Unread ({unread})
            </button>
          </div>
        </div>
        <NotificationList notices={notices} onRead={read} />
      </Panel>
    </>
  );
}
