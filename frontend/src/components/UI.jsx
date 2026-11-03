import React, { Component, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  X,
} from "lucide-react";
import { path } from "../services/api.js";
import { addDays, initials, statusLabel, weekLabel } from "../utils/dates.js";

export function Badge({ status, children }) {
  const success = ["published", "approved", "covered", "eligible"].includes(
    status,
  );
  const warning = [
    "draft",
    "awaiting_colleague",
    "awaiting_supervisor",
    "gap",
  ].includes(status);
  const Icon = success ? CheckCircle2 : warning ? Clock3 : Circle;
  return (
    <span
      className={`pill ${success ? "pill-success" : warning ? "pill-warning" : "pill-neutral"}`}
    >
      <Icon size={12} aria-hidden="true" />
      {children || statusLabel(status)}
    </span>
  );
}
export function Avatar({ name, small = false }) {
  return (
    <span
      className={`avatar ${small ? "avatar-small" : ""}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
export function Loading({ label = "Loading the workspace…" }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-dot" />
      {label}
    </div>
  );
}
export function EmptyState({ title, children, action, icon: Icon = Circle }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function ErrorState({ error, retry }) {
  if (!error) return null;
  const expired = error.status === 401;
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>
          {expired
            ? "Your session has ended."
            : "Something needs your attention."}
        </strong>
        <p>{error.message}</p>
        {expired ? (
          <a className="btn btn-secondary" href={path("/login.php")}>
            Sign in again
          </a>
        ) : (
          retry && (
            <button className="btn btn-secondary" onClick={retry}>
              Try again
            </button>
          )
        )}
      </div>
    </div>
  );
}
export function Feedback({ message }) {
  return message ? (
    <div className="notice notice-success" role="status">
      <CheckCircle2 size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  ) : null;
}
export function FieldErrors({ error }) {
  if (!error) return null;
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <p>{error.message}</p>
        {Object.entries(error.fields || {}).length > 0 && (
          <ul>
            {Object.entries(error.fields).map(([name, value]) => (
              <li key={name}>
                {name === "slots" && Array.isArray(value) ? (
                  <span>
                    {value.length} duty blocks need attention. Review the
                    coverage checks below.
                  </span>
                ) : (
                  <a
                    href={`#field-${name}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(`field-${name}`)?.focus();
                    }}
                  >
                    {String(value)}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
export function WeekNavigator({ week, onChange, rosters = [] }) {
  if (!week) return null;
  return (
    <div className="week-navigator" aria-label="Roster week">
      <button
        className="icon-btn"
        aria-label="Previous week"
        onClick={() => onChange(addDays(week, -7))}
      >
        <ChevronLeft size={18} />
      </button>
      <div className="week-select">
        <label className="visually-hidden" htmlFor="week-select">
          Select roster week
        </label>
        <select
          id="week-select"
          value={week}
          onChange={(event) => onChange(event.target.value)}
        >
          {[...new Set([...rosters.map((roster) => roster.week), week])]
            .sort()
            .map((value) => (
              <option key={value} value={value}>
                {weekLabel(value)}
              </option>
            ))}
        </select>
      </div>
      <button
        className="icon-btn"
        aria-label="Next week"
        onClick={() => onChange(addDays(week, 7))}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function DataTable({
  caption,
  columns,
  rows,
  rowKey = "id",
  empty = "No records in this scope.",
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                scope="col"
                key={column.key}
                className={column.numeric ? "numeric" : ""}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={row[rowKey] ?? index}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.numeric ? "numeric" : ""}
                  >
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="empty-cell">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Drawer({
  title,
  children,
  onClose,
  wide = false,
  modal = false,
}) {
  const element = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const root = document.getElementById("root");
    const oldInert = root.inert;
    root.inert = true;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      element.current?.querySelector("button")?.focus(),
    );
    const keyboard = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = [
        ...element.current.querySelectorAll(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ),
      ].filter((item) => item.getClientRects().length > 0);
      const first = items[0];
      const last = items.at(-1);
      if (!first) {
        event.preventDefault();
        element.current.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !element.current.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", keyboard);
      root.inert = oldInert;
      document.body.style.overflow = oldOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(
    <div
      className={`dialog-backdrop ${modal ? "dialog-centered" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) close.current();
      }}
    >
      <section
        ref={element}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`drawer ${wide ? "drawer-wide" : ""} ${modal ? "confirm-dialog" : ""}`}
      >
        <div className="drawer-head">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={20} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </section>
    </div>,
    document.body,
  );
}
export function ConfirmDialog({
  title,
  children,
  confirm,
  busy,
  onClose,
  onConfirm,
}) {
  return (
    <Drawer title={title} onClose={onClose} modal>
      <p>{children}</p>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? "Saving…" : confirm}
        </button>
      </div>
    </Drawer>
  );
}
export function EligibilityChecklist({ checks = [] }) {
  return (
    <ul className="eligibility-list">
      {checks.map((check, index) => (
        <li
          key={check.code || index}
          className={check.passed ? "check-pass" : "check-fail"}
        >
          {check.passed ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <div>
            <strong>{check.label}</strong>
            {!check.passed && check.detail && <span>{check.detail}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// React 19 does not automatically run legacy propTypes. Call our validator explicitly.
export function validateCountdownProps(props) {
  if (
    props.target != null &&
    (typeof props.target !== "string" || Number.isNaN(Date.parse(props.target)))
  )
    throw new TypeError(
      "NextShiftCountdown target must be a valid ISO timestamp or null.",
    );
  if (props.serverTime != null && Number.isNaN(Date.parse(props.serverTime)))
    throw new TypeError(
      "NextShiftCountdown serverTime must be a valid ISO timestamp.",
    );
  return true;
}
export class NextShiftCountdown extends Component {
  constructor(props) {
    super(props);
    validateCountdownProps(props);
    this.serverOffset = props.serverTime
      ? Date.parse(props.serverTime) - Date.now()
      : 0;
    this.state = { remaining: this.remaining(props.target) };
  }
  remaining(target) {
    return target
      ? Math.max(0, Date.parse(target) - Date.now() - this.serverOffset)
      : 0;
  }
  componentDidMount() {
    this.timer = setInterval(
      () => this.setState({ remaining: this.remaining(this.props.target) }),
      30000,
    );
  }
  componentDidUpdate(previous) {
    if (
      previous.target !== this.props.target ||
      previous.serverTime !== this.props.serverTime
    ) {
      validateCountdownProps(this.props);
      this.serverOffset = this.props.serverTime
        ? Date.parse(this.props.serverTime) - Date.now()
        : 0;
      this.setState({ remaining: this.remaining(this.props.target) });
    }
  }
  componentWillUnmount() {
    clearInterval(this.timer);
  }
  render() {
    if (!this.props.target) return <span>No upcoming duty</span>;
    const minutes = Math.ceil(this.state.remaining / 60000);
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return (
      <span className="countdown">
        <Clock3 size={15} aria-hidden="true" />
        {minutes === 0
          ? "Scheduled start reached"
          : days
            ? `Starts in ${days}d ${hours}h`
            : hours
              ? `Starts in ${hours}h ${minutes % 60}m`
              : `Starts in ${minutes}m`}
      </span>
    );
  }
}
