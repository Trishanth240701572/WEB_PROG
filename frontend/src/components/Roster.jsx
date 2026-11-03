import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeftRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  MapPin,
  Plus,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useWorkspace } from "../context.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../services/api.js";
import {
  addDays,
  dateTime,
  formatDate,
  formatTime,
  hoursFor,
  labName,
  statusLabel,
} from "../utils/dates.js";
import {
  Avatar,
  Badge,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  Feedback,
  FieldErrors,
  Loading,
  Panel,
} from "./UI.jsx";

export function coverageFor(slot, assignments, users) {
  const people = assignments.filter(
    (assignment) => assignment.slotId === slot.id,
  );
  const technicians = people.filter(
    (assignment) =>
      users.find((user) => user.id === assignment.staffId)?.qualification ===
      "technician",
  ).length;
  return {
    ...slot,
    slotId: slot.id,
    assigned: people.length,
    technicians,
    missingPeople: Math.max(0, slot.headcount - people.length),
    missingTechnicians: Math.max(0, slot.technicianMinimum - technicians),
  };
}
export function CoverageBadge({ coverage, compact = false }) {
  const covered =
    coverage.missingPeople === 0 && coverage.missingTechnicians === 0;
  return (
    <span
      className={`coverage-indicator ${covered ? "is-covered" : "has-gap"}`}
    >
      {covered ? (
        <CheckCircle2 size={14} aria-hidden="true" />
      ) : (
        <AlertCircle size={14} aria-hidden="true" />
      )}
      <span>
        {compact
          ? `${coverage.assigned}/${coverage.headcount} people · ${coverage.technicians}/${coverage.technicianMinimum} tech`
          : covered
            ? "Requirements met"
            : `${coverage.missingPeople} people · ${coverage.missingTechnicians} technicians missing`}
      </span>
    </span>
  );
}
export function DutyBlock({ slot, onClick, own = false }) {
  return (
    <button
      className={`duty-block ${slot.lab === "lab-b" ? "duty-lab-b" : ""} ${own ? "duty-own" : ""}`}
      onClick={onClick}
      aria-label={`Open ${labName(slot.lab)}, ${formatDate(slot.date)}, ${formatTime(slot.startsAt)} to ${formatTime(slot.endsAt)} IST`}
    >
      <span className="duty-time">
        {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)}
      </span>
      <span className="duty-location">
        <span className="lab-dot" />
        {labName(slot.lab)}
        <ChevronRight size={12} aria-hidden="true" />
      </span>
    </button>
  );
}
export function RosterGrid({
  slots,
  assignments,
  users,
  week,
  userId,
  onOpen,
}) {
  const days = Array.from({ length: 5 }, (_, index) => addDays(week, index));
  return (
    <div className="roster-scroll">
      <table className="roster-grid">
        <caption className="visually-hidden">
          Team roster, all times in Asia/Kolkata
        </caption>
        <thead>
          <tr>
            <th scope="col" className="staff-column">
              <span>Team member</span>
              <small>{users.length} staff</small>
            </th>
            {days.map((day) => (
              <th key={day} scope="col">
                <span>
                  {formatDate(day, {
                    weekday: "short",
                    day: undefined,
                    month: undefined,
                  })}
                </span>
                <strong>{formatDate(day)}</strong>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <th scope="row" className="staff-column">
                <div className="staff-cell">
                  <Avatar name={user.name} small />
                  <div>
                    <strong>
                      {user.name}
                      {user.id === userId && (
                        <span className="you-label">You</span>
                      )}
                    </strong>
                    <small>
                      {user.qualification === "technician"
                        ? "Technician"
                        : "Lab assistant"}
                    </small>
                  </div>
                </div>
              </th>
              {days.map((day) => {
                const duties = assignments
                  .filter((assignment) => assignment.staffId === user.id)
                  .map((assignment) => ({
                    assignment,
                    slot: slots.find((slot) => slot.id === assignment.slotId),
                  }))
                  .filter(({ slot }) => slot?.date === day)
                  .sort((a, b) =>
                    a.slot.startsAt.localeCompare(b.slot.startsAt),
                  );
                return (
                  <td key={day}>
                    {duties.length ? (
                      duties.map(({ assignment, slot }) => (
                        <DutyBlock
                          key={assignment.id}
                          slot={slot}
                          own={user.id === userId}
                          onClick={() => onOpen(slot, assignment)}
                        />
                      ))
                    ) : (
                      <span className="no-duty" aria-label="No scheduled duty">
                        —
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function AgendaList({
  slots,
  assignments,
  users,
  week,
  userId,
  onOpen,
}) {
  const [dayIndex, setDayIndex] = useState(0);
  const days = Array.from({ length: 5 }, (_, index) => addDays(week, index));
  const day = days[dayIndex];
  const active = slots
    .filter((slot) => slot.date === day)
    .sort(
      (a, b) =>
        a.startsAt.localeCompare(b.startsAt) || a.lab.localeCompare(b.lab),
    );
  return (
    <div className="mobile-agenda">
      <div className="day-selector" aria-label="Select a day">
        {days.map((date, index) => (
          <button
            key={date}
            className={dayIndex === index ? "active" : ""}
            aria-pressed={dayIndex === index}
            onClick={() => setDayIndex(index)}
          >
            <span>
              {formatDate(date, {
                weekday: "short",
                day: undefined,
                month: undefined,
              })}
            </span>
            <strong>{date.slice(-2)}</strong>
          </button>
        ))}
      </div>
      <div className="agenda-list">
        {active.map((slot) => {
          const people = assignments.filter(
            (assignment) => assignment.slotId === slot.id,
          );
          return (
            <section className="agenda-duty" key={slot.id}>
              <div className="agenda-duty-head">
                <span
                  className={`lab-label ${slot.lab === "lab-b" ? "lab-label-b" : ""}`}
                >
                  {labName(slot.lab)}
                </span>
                <span>
                  {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)} IST
                </span>
              </div>
              {people.length ? (
                people.map((assignment) => {
                  const person = users.find(
                    (user) => user.id === assignment.staffId,
                  );
                  return (
                    <button
                      key={assignment.id}
                      className="agenda-person"
                      onClick={() => onOpen(slot, assignment)}
                    >
                      <Avatar name={person?.name} small />
                      <span>
                        <strong>
                          {person?.name}
                          {person?.id === userId && " · You"}
                        </strong>
                        <small>
                          {person?.qualification === "technician"
                            ? "Technician"
                            : "Lab assistant"}
                        </small>
                      </span>
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  );
                })
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => onOpen(slot, null)}
                >
                  <Plus size={16} />
                  View empty block
                </button>
              )}
              <CoverageBadge
                compact
                coverage={coverageFor(slot, assignments, users)}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
export function CoverageTable({ rows, onOpen }) {
  return (
    <DataTable
      caption="Coverage by duty block"
      rowKey="slotId"
      rows={rows}
      columns={[
        {
          key: "date",
          label: "Day",
          render: (row) => (
            <strong>{formatDate(row.date, { weekday: "short" })}</strong>
          ),
        },
        {
          key: "block",
          label: "Duty block",
          render: (row) => (
            <span className="capitalize">
              {row.block}
              <small className="cell-secondary">
                {row.block === "morning" ? "09:00–12:00" : "13:00–16:00"} IST
              </small>
            </span>
          ),
        },
        { key: "lab", label: "Location", render: (row) => labName(row.lab) },
        {
          key: "assigned",
          label: "People",
          render: (row) => (
            <span>
              {row.assigned} <span className="muted">/ {row.headcount}</span>
            </span>
          ),
          numeric: true,
        },
        {
          key: "technicians",
          label: "Technicians",
          render: (row) => (
            <span>
              {row.technicians}{" "}
              <span className="muted">/ {row.technicianMinimum}</span>
            </span>
          ),
          numeric: true,
        },
        {
          key: "state",
          label: "Coverage",
          render: (row) => <CoverageBadge coverage={row} />,
        },
        ...(onOpen
          ? [
              {
                key: "edit",
                label: "Details",
                render: (row) => (
                  <button className="btn btn-quiet" onClick={() => onOpen(row)}>
                    Open
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

export function ShiftDrawer({ slot, assignment, onClose }) {
  const { data, meta } = useWorkspace();
  const staff = data.users.find((user) => user.id === assignment?.staffId);
  const coverage = coverageFor(slot, data.assignments, data.users);
  const future = Date.parse(slot.startsAt) > Date.parse(meta.serverTime);
  const own = assignment?.staffId === data.user.id;
  return (
    <Drawer title="Duty details" onClose={onClose}>
      <div className="shift-hero">
        <span
          className={`lab-label ${slot.lab === "lab-b" ? "lab-label-b" : ""}`}
        >
          <MapPin size={14} />
          {labName(slot.lab)}
        </span>
        <h3>{formatDate(slot.date, { weekday: "long", year: "numeric" })}</h3>
        <p>
          <Clock3 size={17} />
          {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)} IST
          <span>{hoursFor(slot)} scheduled hours</span>
        </p>
      </div>
      {staff && (
        <div className="assigned-person">
          <Avatar name={staff.name} />
          <div>
            <strong>{staff.name}</strong>
            <span>
              {staff.qualification === "technician"
                ? "Technician"
                : "Lab assistant"}
              {own && " · Your duty"}
            </span>
          </div>
        </div>
      )}
      <div className="detail-section">
        <h3>Coverage requirements</h3>
        <dl className="detail-list">
          <div>
            <dt>Assigned people</dt>
            <dd>
              {coverage.assigned} / {slot.headcount}
            </dd>
          </div>
          <div>
            <dt>Qualified technicians</dt>
            <dd>
              {coverage.technicians} / {slot.technicianMinimum}
            </dd>
          </div>
        </dl>
        <CoverageBadge coverage={coverage} />
      </div>
      <div className="detail-section">
        <h3>Working together</h3>
        {data.assignments
          .filter((item) => item.slotId === slot.id)
          .map((item) => {
            const person = data.users.find((user) => user.id === item.staffId);
            return (
              <div className="person-row" key={item.id}>
                <Avatar small name={person?.name} />
                <span>{person?.name}</span>
                {person?.qualification === "technician" && (
                  <ShieldCheck size={16} aria-label="Technician" />
                )}
              </div>
            );
          })}
      </div>
      {own && future && (
        <div className="drawer-bottom">
          <p className="muted">
            An exchange changes the roster only after your colleague and
            supervisor approve it.
          </p>
          <Link
            className="btn btn-primary full-width"
            onClick={onClose}
            to={`/swaps/new?assignment=${assignment.id}`}
          >
            <ArrowLeftRight size={17} />
            Request an exchange
          </Link>
        </div>
      )}
      {!future && (
        <p className="muted">
          This duty has started. Exchanges are available for future duties.
        </p>
      )}
    </Drawer>
  );
}

function requirementBaseline(values, version) {
  return {
    headcount: String(values.headcount),
    technicianMinimum: String(values.technicianMinimum),
    originalHeadcount: String(values.headcount),
    originalTechnicianMinimum: String(values.technicianMinimum),
    version,
    conflict: false,
  };
}
function requirementsChanged(values) {
  return (
    values.headcount !== values.originalHeadcount ||
    values.technicianMinimum !== values.originalTechnicianMinimum
  );
}

export function SlotEditor({ slot, roster, onClose }) {
  const { data, refresh } = useWorkspace();
  const candidates = useApi(
    "assignment-candidates",
    { slotId: slot.id },
    true,
    { revision: data.revision },
  );
  const [form, setForm] = useState(() =>
    requirementBaseline(slot, roster.version),
  );
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const dirty = requirementsChanged(form);
  const readOnly = roster.status !== "draft";
  useEffect(() => {
    if (busy) return;
    setForm((current) => {
      // Older bootstrap responses must never roll back a successful save's baseline.
      if (roster.version <= current.version) return current;
      if (requirementsChanged(current) || current.conflict)
        return { ...current, conflict: true };
      return requirementBaseline(
        {
          headcount: slot.headcount,
          technicianMinimum: slot.technicianMinimum,
        },
        roster.version,
      );
    });
  }, [slot.headcount, slot.technicianMinimum, roster.version, busy]);
  const assigned = data.assignments.filter(
    (assignment) => assignment.slotId === slot.id,
  );
  const coverage = coverageFor(slot, data.assignments, data.users);
  async function command(action, values) {
    if (activeRequest.current || readOnly) return;
    activeRequest.current = true;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const saved = await api(action, {
        body: { rosterId: roster.id, version: form.version, ...values },
      });
      // The mutation's returned version belongs to these exact submitted values.
      // It remains authoritative even if the following bootstrap request fails.
      setForm(
        requirementBaseline(
          action === "roster.requirements" ? values : form,
          saved.data.version,
        ),
      );
      await refresh();
      await candidates.refresh();
      setMessage("Draft saved. Coverage has been recalculated.");
    } catch (failure) {
      setError(failure);
      if (failure.status === 409) {
        if (
          failure.code === "stale_version" ||
          failure.code === "roster_published"
        )
          setForm((current) => ({ ...current, conflict: true }));
        await refresh();
      }
    } finally {
      activeRequest.current = false;
      setBusy(false);
    }
  }
  async function reload() {
    if (activeRequest.current) return;
    activeRequest.current = true;
    setBusy(true);
    const latest = await refresh();
    const latestSlot = latest?.data.slots.find((value) => value.id === slot.id);
    const latestRoster = latest?.data.rosters.find(
      (value) => value.id === roster.id,
    );
    if (latestSlot && latestRoster) {
      setForm(requirementBaseline(latestSlot, latestRoster.version));
      setError(null);
      setMessage(
        "Latest saved requirements loaded. Your editing baseline is up to date.",
      );
      await candidates.refresh();
    } else {
      setError({
        message:
          "Could not reload the saved requirements. Your input has been kept; try reloading again.",
      });
    }
    activeRequest.current = false;
    setBusy(false);
  }
  return (
    <Drawer title="Plan duty block" onClose={onClose}>
      <div className="shift-hero">
        <span
          className={`lab-label ${slot.lab === "lab-b" ? "lab-label-b" : ""}`}
        >
          {labName(slot.lab)}
        </span>
        <h3>{formatDate(slot.date, { weekday: "long" })}</h3>
        <p>
          {formatTime(slot.startsAt)}–{formatTime(slot.endsAt)} IST
        </p>
        <CoverageBadge coverage={coverage} />
      </div>
      <FieldErrors error={error} />
      <Feedback message={message} />
      {(form.conflict || readOnly) && (
        <div className="notice notice-warning" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>
              {readOnly
                ? "This roster has been published."
                : "A newer draft is available."}
            </strong>
            <p>
              Your input is kept with editing version {form.version}.{" "}
              {readOnly
                ? "Published requirements cannot be changed directly."
                : "Saving this older snapshot will be rejected. Reload to use the latest saved requirements; reloading replaces your unsaved input."}
            </p>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={reload}
            >
              Reload saved requirements
            </button>
          </div>
        </div>
      )}
      <form
        className="detail-section"
        onSubmit={(event) => {
          event.preventDefault();
          command("roster.requirements", {
            slotId: slot.id,
            headcount: Number(form.headcount),
            technicianMinimum: Number(form.technicianMinimum),
          });
        }}
      >
        <h3>Block requirements</h3>
        <div className="form-row">
          <div className="field">
            <label className="form-label" htmlFor="field-headcount">
              People required
            </label>
            <input
              className="form-control"
              id="field-headcount"
              type="number"
              min="1"
              max="12"
              value={form.headcount}
              disabled={busy || readOnly}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  headcount: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="field">
            <label className="form-label" htmlFor="field-technicianMinimum">
              Technicians required
            </label>
            <input
              className="form-control"
              id="field-technicianMinimum"
              type="number"
              min="0"
              max={form.headcount}
              value={form.technicianMinimum}
              disabled={busy || readOnly}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  technicianMinimum: event.target.value,
                }))
              }
              required
            />
          </div>
        </div>
        <p className="field-help">
          {dirty ? "Unsaved requirement edits" : "Saved requirements"} · Editing
          version {form.version}
        </p>
        <button
          className="btn btn-secondary"
          disabled={busy || readOnly}
          type="submit"
        >
          Save requirements
        </button>
        {dirty && !form.conflict && !readOnly && (
          <button
            className="btn btn-quiet"
            type="button"
            disabled={busy}
            onClick={reload}
          >
            Reload saved requirements
          </button>
        )}
      </form>
      <div className="detail-section">
        <h3>
          Assigned team{" "}
          <span className="muted">
            {assigned.length}/{slot.headcount}
          </span>
        </h3>
        {dirty && (
          <p className="muted">
            Save or reload your requirement edits before changing the assigned
            team.
          </p>
        )}
        {assigned.length ? (
          assigned.map((assignment) => {
            const person = data.users.find(
              (user) => user.id === assignment.staffId,
            );
            return (
              <div className="person-row" key={assignment.id}>
                <Avatar name={person?.name} small />
                <span>
                  <strong>{person?.name}</strong>
                  <small>
                    {person?.qualification === "technician"
                      ? "Technician"
                      : "Lab assistant"}
                  </small>
                </span>
                <button
                  className="btn btn-quiet"
                  disabled={busy || readOnly || dirty || form.conflict}
                  onClick={() =>
                    command("roster.remove", { assignmentId: assignment.id })
                  }
                >
                  Remove
                </button>
              </div>
            );
          })
        ) : (
          <p className="muted">No staff assigned to this block.</p>
        )}
      </div>
      <div className="detail-section">
        <h3>Staff eligibility</h3>
        <p className="muted">
          Only available staff without a conflict can be assigned. PHP checks
          again when you save.
        </p>
        {candidates.loading && <Loading label="Checking staff eligibility…" />}
        <ErrorState
          error={candidates.error}
          retry={() => candidates.refresh()}
        />
        {(candidates.data || []).map((person) => (
          <div
            className={`candidate-row ${person.eligible ? "" : "candidate-blocked"}`}
            key={person.staffId}
          >
            <Avatar name={person.name} small />
            <div>
              <strong>{person.name}</strong>
              <small>
                {person.qualification === "technician"
                  ? "Technician"
                  : "Lab assistant"}
              </small>
              {!person.eligible && <p>{(person.reasons || []).join(" · ")}</p>}
            </div>
            <button
              className="btn btn-secondary"
              disabled={
                busy || readOnly || dirty || form.conflict || !person.eligible
              }
              aria-label={`Assign ${person.name}`}
              onClick={() =>
                command("roster.assign", {
                  slotId: slot.id,
                  staffId: person.staffId,
                })
              }
            >
              <Plus size={16} />
              <span>Assign</span>
            </button>
          </div>
        ))}
      </div>
    </Drawer>
  );
}

export default function RosterPage({ manage = false }) {
  const { data, week, setWeek, refresh } = useWorkspace();
  const [lab, setLab] = useState("all");
  const [view, setView] = useState(manage ? "coverage" : "roster");
  const [selection, setSelection] = useState(null);
  const [publish, setPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const roster = data.rosters.find((item) => item.week === week);
  const allSlots = data.slots.filter((slot) => slot.rosterId === roster?.id);
  const slots = allSlots.filter((slot) => lab === "all" || slot.lab === lab);
  const assignments = data.assignments.filter((assignment) =>
    slots.some((slot) => slot.id === assignment.slotId),
  );
  const users = data.users.filter(
    (user) => user.role === "staff" && user.active,
  );
  const rows = slots
    .map((slot) => coverageFor(slot, data.assignments, data.users))
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startsAt.localeCompare(b.startsAt) ||
        a.lab.localeCompare(b.lab),
    );
  const fullRows = allSlots.map((slot) =>
    coverageFor(slot, data.assignments, data.users),
  );
  const covered = fullRows.filter(
    (row) => row.missingPeople === 0 && row.missingTechnicians === 0,
  ).length;
  const missingPeople = fullRows.reduce(
    (total, row) => total + row.missingPeople,
    0,
  );
  const missingTechnicians = fullRows.reduce(
    (total, row) => total + row.missingTechnicians,
    0,
  );
  const editable = manage && roster?.status === "draft";
  function open(slot, assignment = null) {
    setSelection({
      slotId: slot.id || slot.slotId,
      assignmentId: assignment?.id,
      editing: editable,
    });
  }
  async function mutate(action, body) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      await api(action, { body });
      await refresh();
      setPublish(false);
      setMessage(
        action === "roster.publish"
          ? "Roster published. The assigned team has been notified."
          : "Draft week created. Set the team for each block, then publish when every requirement is met.",
      );
    } catch (failure) {
      setError(failure);
      if (failure.status === 409) await refresh();
      setPublish(false);
    } finally {
      setBusy(false);
    }
  }
  const selectedSlot = data.slots.find((slot) => slot.id === selection?.slotId);
  const selectedAssignment = data.assignments.find(
    (assignment) => assignment.id === selection?.assignmentId,
  );
  return (
    <>
      <FieldErrors error={error} />
      <Feedback message={message} />
      {roster ? (
        <>
          <div className="roster-summary">
            <div className="roster-summary-title">
              <CalendarDays size={22} aria-hidden="true" />
              <div>
                <strong>{statusLabel(roster.status)} week</strong>
                <span>
                  {manage
                    ? `Version ${roster.version} · ${allSlots.length} duty blocks`
                    : "Published by your supervisor"}
                </span>
              </div>
              <Badge status={roster.status} />
            </div>
            {manage && (
              <div className="coverage-summary">
                <span>
                  <strong>
                    {covered}
                    <small>/{allSlots.length}</small>
                  </strong>
                  blocks covered
                </span>
                <span className={missingPeople ? "text-warning" : ""}>
                  <strong>{missingPeople}</strong>people missing
                </span>
                <span className={missingTechnicians ? "text-warning" : ""}>
                  <strong>{missingTechnicians}</strong>technicians missing
                </span>
              </div>
            )}
            {editable && (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => setPublish(true)}
              >
                <CheckCircle2 size={17} />
                Publish roster
              </button>
            )}
          </div>
          {roster.status === "published" && manage && (
            <div className="inline-note">
              <ShieldCheck size={16} aria-hidden="true" />
              Published duties are protected. Assignees can change through an
              approved two-way exchange.
            </div>
          )}
          <section className="panel roster-panel">
            <div className="roster-toolbar">
              <div className="segmented-control" aria-label="Roster view">
                <button
                  className={view === "roster" ? "active" : ""}
                  aria-pressed={view === "roster"}
                  onClick={() => setView("roster")}
                >
                  Team schedule
                </button>
                {manage && (
                  <button
                    className={view === "coverage" ? "active" : ""}
                    aria-pressed={view === "coverage"}
                    onClick={() => setView("coverage")}
                  >
                    Coverage checks
                  </button>
                )}
              </div>
              <div className="roster-filters">
                <label className="visually-hidden" htmlFor="lab-filter">
                  Laboratory
                </label>
                <select
                  className="form-select compact-select"
                  id="lab-filter"
                  value={lab}
                  onChange={(event) => setLab(event.target.value)}
                >
                  <option value="all">All laboratories</option>
                  <option value="lab-a">Lab A</option>
                  <option value="lab-b">Lab B</option>
                </select>
                <span className="timezone-label">IST · UTC+05:30</span>
              </div>
            </div>
            {view === "roster" ? (
              <>
                <RosterGrid
                  slots={slots}
                  assignments={assignments}
                  users={users}
                  week={week}
                  userId={data.user.id}
                  onOpen={open}
                />
                <AgendaList
                  slots={slots}
                  assignments={assignments}
                  users={users}
                  week={week}
                  userId={data.user.id}
                  onOpen={open}
                />
              </>
            ) : (
              <CoverageTable rows={rows} onOpen={open} />
            )}
            <div className="roster-legend">
              <span>
                <i className="lab-dot" />
                Lab A
              </span>
              <span>
                <i className="lab-dot lab-dot-b" />
                Lab B
              </span>
              <span>
                <ShieldCheck size={14} />
                Technicians count toward people and qualification requirements.
              </span>
            </div>
          </section>
        </>
      ) : (
        <Panel
          title="A clear week, ready to plan"
          description="No roster has been saved for the selected week."
        >
          <EmptyState
            title={
              manage ? "Start this week’s roster" : "No published roster yet"
            }
            icon={CalendarDays}
            action={
              manage ? (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => mutate("roster.create", { week })}
                >
                  <Plus size={17} />
                  Create draft week
                </button>
              ) : (
                <a
                  className="btn btn-secondary"
                  href={`./availability.php?week=${week}`}
                >
                  Review my availability
                </a>
              )
            }
          >
            {manage
              ? "Create the twenty weekday blocks for both labs. You can set requirements and assign the team before publication."
              : "Your supervisor will publish the schedule when all coverage requirements are met."}
          </EmptyState>
        </Panel>
      )}
      {selectedSlot &&
        (selection.editing ? (
          <SlotEditor
            key={selectedSlot.id}
            slot={selectedSlot}
            roster={data.rosters.find(
              (value) => value.id === selectedSlot.rosterId,
            )}
            onClose={() => setSelection(null)}
          />
        ) : (
          <ShiftDrawer
            slot={selectedSlot}
            assignment={selectedAssignment}
            onClose={() => setSelection(null)}
          />
        ))}
      {publish && (
        <ConfirmDialog
          title="Publish this roster?"
          confirm="Publish & notify team"
          busy={busy}
          onClose={() => setPublish(false)}
          onConfirm={() =>
            mutate("roster.publish", {
              rosterId: roster.id,
              version: roster.version,
            })
          }
        >
          PHP will check all {allSlots.length} blocks, staff availability,
          conflicts, and technician requirements. Once published, this week is
          read-only except for approved exchanges.
          {(missingPeople > 0 || missingTechnicians > 0) &&
            ` There are currently ${missingPeople} missing people and ${missingTechnicians} missing technicians; publication will be blocked until these are fixed.`}
        </ConfirmDialog>
      )}
    </>
  );
}
