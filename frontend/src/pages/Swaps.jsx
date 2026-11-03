import React, { useEffect, useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useWorkspace } from "../context.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../services/api.js";
import {
  dateTime,
  formatDate,
  formatTime,
  isPending,
  labName,
  statusLabel,
} from "../utils/dates.js";
import {
  Avatar,
  Badge,
  DataTable,
  EligibilityChecklist,
  EmptyState,
  ErrorState,
  Feedback,
  FieldErrors,
  Loading,
  Panel,
} from "../components/UI.jsx";
import { CoverageBadge } from "../components/Roster.jsx";

function personName(data, id) {
  return data.users.find((user) => user.id === id)?.name || "Team member";
}
function assignmentDescription(data, assignmentId) {
  const assignment = data.assignments.find((item) => item.id === assignmentId);
  const slot = data.slots.find((item) => item.id === assignment?.slotId);
  return slot
    ? `${formatDate(slot.date, { weekday: "short" })} · ${formatTime(slot.startsAt)} · ${labName(slot.lab)}`
    : "Duty details unavailable";
}
export function RequestTimeline({ request, users }) {
  const savedTimeline = request.timeline || request.history;
  const entries = savedTimeline?.length
    ? savedTimeline
    : [
        {
          status: request.status,
          at: request.createdAt,
          message: request.decisionReason,
        },
      ];
  return (
    <ol className="request-timeline">
      {entries.map((entry, index) => (
        <li key={index}>
          <span className="timeline-point">
            <CheckCircle2 size={14} aria-hidden="true" />
          </span>
          <div>
            <strong>
              {statusLabel(
                entry.status ||
                  entry.to ||
                  entry.event ||
                  entry.action ||
                  "Request updated",
              )}
            </strong>
            <small>
              {dateTime(entry.at || entry.time || entry.createdAt)} IST
              {entry.actorId &&
                ` · ${users.find((user) => user.id === entry.actorId)?.name || "System"}`}
            </small>
            {(entry.reason || entry.message || entry.note) && (
              <p>{entry.reason || entry.message || entry.note}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
export function SwapComparison({ preview }) {
  if (!preview) return null;
  return (
    <div className="swap-comparison">
      <div className="comparison-heading">
        <h3>Two duties. Both directions checked.</h3>
        <Badge status={preview.eligible ? "eligible" : "gap"}>
          {preview.eligible ? "Eligible exchange" : "Review required"}
        </Badge>
      </div>
      <div className="comparison-columns">
        {["before", "after"].map((mode) => (
          <section className="comparison-column" key={mode}>
            <h4>
              {mode === "before" ? "Current assignments" : "After approval"}
            </h4>
            {(preview[mode] || []).map((assignment, index) => (
              <div
                className="comparison-assignment"
                key={`${assignment.assignmentId}-${index}`}
              >
                <div className="person-row">
                  <Avatar name={assignment.name} small />
                  <div>
                    <strong>{assignment.name}</strong>
                    <small>
                      {assignment.qualification === "technician"
                        ? "Technician"
                        : "Lab assistant"}
                    </small>
                  </div>
                </div>
                <div className="comparison-duty">
                  <strong>
                    {formatDate(assignment.slot.date, { weekday: "short" })} ·{" "}
                    {labName(assignment.slot.lab)}
                  </strong>
                  <span>
                    {formatTime(assignment.slot.startsAt)}–
                    {formatTime(assignment.slot.endsAt)} IST
                  </span>
                </div>
                {preview.coverage?.[mode]?.[index] && (
                  <CoverageBadge
                    compact
                    coverage={preview.coverage[mode][index]}
                  />
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
      {preview.hours?.length > 0 && (
        <div className="hours-comparison">
          <h4>Scheduled hours in this week</h4>
          {preview.hours.map((person) => (
            <div key={person.staffId}>
              <span>{person.name}</span>
              <strong>
                {person.before}h <ArrowRight size={13} aria-label="becomes" />
                {person.after}h
              </strong>
            </div>
          ))}
          <p>
            {preview.hoursNote ||
              "Both duties are equal in length; weekly scheduled hours stay unchanged."}
          </p>
        </div>
      )}
      <div className="detail-section">
        <h3>Eligibility checks</h3>
        <EligibilityChecklist checks={preview.checks} />
        <p className="muted small-copy">
          This preview is advisory. PHP rechecks the latest saved assignments
          and coverage when a decision is committed.
        </p>
      </div>
    </div>
  );
}

export default function SwapsPage({ supervisor = false }) {
  const { data, week } = useWorkspace();
  const [tab, setTab] = useState(supervisor ? "pending" : "incoming");
  const [status, setStatus] = useState("all");
  const [person, setPerson] = useState("all");
  const inWeek = (request) => {
    const assignment = data.assignments.find(
      (item) => item.id === request.assignmentId,
    );
    const slot = data.slots.find((item) => item.id === assignment?.slotId);
    return (
      data.rosters.find((roster) => roster.id === slot?.rosterId)?.week === week
    );
  };
  const scoped = data.swaps.filter(inWeek);
  const requests = scoped
    .filter((request) => {
      const category = supervisor
        ? tab === "pending"
          ? request.status === "awaiting_supervisor"
          : request.status !== "awaiting_supervisor"
        : tab === "incoming"
          ? request.recipientId === data.user.id
          : tab === "outgoing"
            ? request.requesterId === data.user.id
            : !isPending(request.status);
      return (
        category &&
        (status === "all" || request.status === status) &&
        (person === "all" ||
          [request.requesterId, request.recipientId].includes(person))
      );
    })
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return (
    <>
      <div className="section-heading">
        <div className="segmented-control" aria-label="Request category">
          {(supervisor
            ? [
                ["pending", "Awaiting review"],
                ["processed", "Other requests"],
              ]
            : [
                ["incoming", "Incoming"],
                ["outgoing", "Outgoing"],
                ["history", "History"],
              ]
          ).map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
              {value === "pending" && (
                <span className="tab-count">
                  {
                    scoped.filter(
                      (request) => request.status === "awaiting_supervisor",
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </div>
        {!supervisor && (
          <Link className="btn btn-primary" to="/swaps/new">
            <Plus size={17} />
            Request exchange
          </Link>
        )}
      </div>
      <div className="inline-note">
        <ShieldCheck size={17} aria-hidden="true" />
        {supervisor
          ? "An accepted request changes the roster only when your final approval passes every check."
          : "Submitting or accepting a request leaves the roster unchanged until supervisor approval."}
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>
              {supervisor
                ? tab === "pending"
                  ? "Ready for your decision"
                  : "Request history & other states"
                : tab === "incoming"
                  ? "Requests from your colleagues"
                  : tab === "outgoing"
                    ? "Your exchange requests"
                    : "Completed requests"}
            </h2>
            <p>Filtered by the duties’ roster week.</p>
          </div>
          <div className="inline-actions">
            <label className="visually-hidden" htmlFor="swap-status">
              Filter request status
            </label>
            <select
              className="form-select compact-select"
              id="swap-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All states</option>
              {[
                "awaiting_colleague",
                "awaiting_supervisor",
                "approved",
                "declined",
                "rejected",
                "withdrawn",
                "expired",
                "invalidated",
              ].map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
            {supervisor && (
              <>
                <label className="visually-hidden" htmlFor="swap-person">
                  Filter involved staff
                </label>
                <select
                  className="form-select compact-select"
                  id="swap-person"
                  value={person}
                  onChange={(event) => setPerson(event.target.value)}
                >
                  <option value="all">All staff</option>
                  {data.users
                    .filter((user) => user.role === "staff")
                    .map((user) => (
                      <option value={user.id} key={user.id}>
                        {user.name}
                      </option>
                    ))}
                </select>
              </>
            )}
          </div>
        </div>
        {requests.length ? (
          <div className="request-list">
            {requests.map((request) => (
              <Link
                key={request.id}
                className="request-row"
                to={`/swaps/${request.id}`}
              >
                <div className="request-people">
                  <span className="exchange-symbol">
                    <ArrowLeftRight size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>
                      {supervisor
                        ? `${personName(data, request.requesterId)} & ${personName(data, request.recipientId)}`
                        : personName(
                            data,
                            request.requesterId === data.user.id
                              ? request.recipientId
                              : request.requesterId,
                          )}
                    </strong>
                    <span>
                      {assignmentDescription(data, request.assignmentId)}{" "}
                      <ArrowRight size={12} aria-hidden="true" />{" "}
                      {assignmentDescription(data, request.targetAssignmentId)}
                    </span>
                  </div>
                </div>
                <div className="request-row-meta">
                  <Badge status={request.status} />
                  <small>{dateTime(request.createdAt)} IST</small>
                </div>
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              supervisor
                ? "No requests to review"
                : "Nothing here for this week"
            }
            icon={ArrowLeftRight}
          >
            {supervisor
              ? "Accepted exchanges will appear here for a final coverage review."
              : "Change the week or category to see other requests."}
          </EmptyState>
        )}
      </section>
    </>
  );
}

export function NewSwapPage() {
  const { data, week, meta, refresh } = useWorkspace();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const ownAssignments = data.assignments.filter((assignment) => {
    const slot = data.slots.find((item) => item.id === assignment.slotId);
    const roster = data.rosters.find((item) => item.id === slot?.rosterId);
    return (
      assignment.staffId === data.user.id &&
      roster?.status === "published" &&
      (search.get("assignment") === assignment.id || roster.week === week) &&
      Date.parse(slot.startsAt) > Date.parse(meta.serverTime)
    );
  });
  const [source, setSource] = useState(search.get("assignment") || "");
  const sourceId = source || ownAssignments[0]?.id || "";
  const candidates = useApi(
    "candidates",
    { assignmentId: sourceId },
    Boolean(sourceId),
  );
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("eligible");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ambiguous, setAmbiguous] = useState(false);
  const operation = useRef(null);
  const previousWeek = useRef(week);
  useEffect(() => {
    if (previousWeek.current !== week) {
      previousWeek.current = week;
      setSource("");
      setSelected(null);
      setError(null);
      setAmbiguous(false);
    }
  }, [week]);
  const options = candidates.data || [];
  const candidate =
    selected && options.find((option) => option.assignmentId === selected);
  async function submit(event) {
    event.preventDefault();
    if (busy || !candidate?.eligible || ambiguous) return;
    setBusy(true);
    setError(null);
    const operationId = crypto.randomUUID();
    operation.current = operationId;
    try {
      const response = await api("swap.create", {
        body: {
          assignmentId: sourceId,
          targetAssignmentId: candidate.assignmentId,
          note,
          operationId,
        },
      });
      await refresh();
      const request = response.data.swap || response.data;
      navigate(`/swaps/${request.id}`);
    } catch (failure) {
      setError(failure);
      if (
        failure.code === "NETWORK" ||
        failure.code === "RESPONSE" ||
        failure.status >= 500
      )
        setAmbiguous(true);
      if (failure.status === 409) {
        await refresh();
        await candidates.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/swaps">
        <ArrowLeft size={16} />
        Back to swap centre
      </Link>
      <div className="workflow-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Choose the two duties</h2>
              <p>Both people must be eligible for the duty they receive.</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="field">
              <label className="form-label" htmlFor="field-assignmentId">
                Your duty to exchange
              </label>
              <select
                className="form-select"
                id="field-assignmentId"
                value={sourceId}
                onChange={(event) => {
                  setSource(event.target.value);
                  setSelected(null);
                  setError(null);
                  setAmbiguous(false);
                }}
              >
                {!ownAssignments.length && (
                  <option value="">No eligible future duties this week</option>
                )}
                {ownAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignmentDescription(data, assignment.id)}
                  </option>
                ))}
              </select>
            </div>
            {!sourceId ? (
              <EmptyState title="No future duty selected" icon={Clock3}>
                Choose a published week with one of your future assignments.
              </EmptyState>
            ) : (
              <>
                <div className="candidate-heading">
                  <h3>Colleague duties</h3>
                  <div className="segmented-control small-segment">
                    <button
                      type="button"
                      className={filter === "eligible" ? "active" : ""}
                      aria-pressed={filter === "eligible"}
                      onClick={() => setFilter("eligible")}
                    >
                      Eligible ({options.filter((item) => item.eligible).length}
                      )
                    </button>
                    <button
                      type="button"
                      className={filter === "all" ? "active" : ""}
                      aria-pressed={filter === "all"}
                      onClick={() => setFilter("all")}
                    >
                      All options
                    </button>
                  </div>
                </div>
                {candidates.loading && (
                  <Loading label="Checking both sides of each exchange…" />
                )}
                <ErrorState
                  error={candidates.error}
                  retry={() => candidates.refresh()}
                />
                {!candidates.loading &&
                  !options.filter(
                    (option) => filter === "all" || option.eligible,
                  ).length && (
                    <EmptyState
                      title="No eligible exchange found"
                      icon={ArrowLeftRight}
                    >
                      Review All options for specific reasons, or select another
                      duty.
                    </EmptyState>
                  )}
                <div className="candidate-list">
                  {options
                    .filter((option) => filter === "all" || option.eligible)
                    .map((option) => (
                      <div
                        className={`swap-candidate ${selected === option.assignmentId ? "selected" : ""} ${option.eligible ? "" : "blocked"}`}
                        key={option.assignmentId}
                      >
                        <div className="person-row">
                          <Avatar
                            name={
                              option.name || personName(data, option.staffId)
                            }
                            small
                          />
                          <div>
                            <strong>
                              {option.name || personName(data, option.staffId)}
                            </strong>
                            <small>
                              {option.qualification === "technician"
                                ? "Technician"
                                : "Lab assistant"}
                            </small>
                          </div>
                          <Badge status={option.eligible ? "eligible" : "gap"}>
                            {option.eligible ? "Eligible" : "Blocked"}
                          </Badge>
                        </div>
                        <p className="candidate-duty">
                          {assignmentDescription(data, option.assignmentId)}
                        </p>
                        {!option.eligible && (
                          <ul className="blocked-reasons">
                            {option.reasons.map((reason, index) => (
                              <li key={index}>
                                <AlertCircle size={14} aria-hidden="true" />
                                {reason}
                              </li>
                            ))}
                          </ul>
                        )}
                        {option.eligible && (
                          <button
                            type="button"
                            className={`btn ${selected === option.assignmentId ? "btn-primary" : "btn-secondary"} full-width`}
                            onClick={() => setSelected(option.assignmentId)}
                          >
                            {selected === option.assignmentId ? (
                              <CheckCircle2 size={16} />
                            ) : (
                              <ArrowLeftRight size={16} />
                            )}
                            {selected === option.assignmentId
                              ? "Selected for exchange"
                              : "Review this exchange"}
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </section>
        <section className="panel exchange-preview-panel">
          <div className="panel-head">
            <div>
              <h2>Exchange preview</h2>
              <p>No duties change when you submit.</p>
            </div>
          </div>
          <div className="panel-body">
            {candidate ? (
              <>
                <SwapComparison preview={candidate.preview} />
                <form onSubmit={submit}>
                  <div className="field">
                    <label className="form-label" htmlFor="field-note">
                      Note to your colleague{" "}
                      <span className="muted">(optional)</span>
                    </label>
                    <textarea
                      className="form-control"
                      id="field-note"
                      maxLength="500"
                      rows="3"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                    <p className="field-help">
                      Visible only to the two people involved and your
                      supervisor.
                    </p>
                  </div>
                  <FieldErrors error={error} />
                  {ambiguous && (
                    <div className="notice notice-warning">
                      <AlertCircle size={18} />
                      <div>
                        <strong>The result needs checking.</strong>
                        <p>
                          Your request may have saved. Open your outgoing
                          requests before making another submission.
                        </p>
                        <Link className="btn btn-secondary" to="/swaps">
                          Check saved requests
                        </Link>
                      </div>
                    </div>
                  )}
                  <button
                    className="btn btn-primary full-width"
                    type="submit"
                    disabled={busy || !candidate.eligible || ambiguous}
                  >
                    <ArrowRight size={17} />
                    {busy ? "Submitting request…" : "Send exchange request"}
                  </button>
                </form>
              </>
            ) : (
              <EmptyState title="See both sides first" icon={ArrowLeftRight}>
                Select an eligible colleague duty to compare assignments,
                coverage, and scheduled hours.
              </EmptyState>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export function SwapDetailPage() {
  const { id } = useParams();
  const { data, refresh, registerRefresh } = useWorkspace();
  const request = data.swaps.find((item) => item.id === id);
  const hasRequest = Boolean(request);
  const preview = useApi("preview", { id }, hasRequest, {
    revision: data.revision,
  });
  useEffect(() => {
    if (hasRequest) return registerRefresh("preview", preview.refresh);
    return undefined;
  }, [hasRequest, registerRefresh, preview.refresh]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const supervisor = data.user.role === "supervisor";
  async function decide(action) {
    if (busy) return;
    if (action === "reject" && !reason.trim()) {
      setError({
        message:
          "Add a short reason so both staff members understand the decision.",
        fields: { reason: "A rejection reason is required." },
      });
      return;
    }
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const response = await api(`swap.${action}`, {
        body: { id, version: request.version, reason },
      });
      const result = response.data.swap || response.data;
      await refresh();
      setMessage(
        `Request saved: ${statusLabel(result.status || request.status)}.${result.status === "approved" ? " Both assignment owners have been exchanged." : ""}`,
      );
      setRejecting(false);
    } catch (failure) {
      setError(failure);
      if (failure.status === 409) {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  if (!request)
    return (
      <EmptyState
        title="Request unavailable"
        icon={AlertCircle}
        action={
          <Link
            className="btn btn-secondary"
            to={supervisor ? "/manage/approvals" : "/swaps"}
          >
            Return to requests
          </Link>
        }
      >
        The request may not exist, or your account does not have permission to
        view it.
      </EmptyState>
    );
  const mayRespond =
    request.status === "awaiting_colleague" &&
    request.recipientId === data.user.id;
  const mayWithdraw =
    isPending(request.status) && request.requesterId === data.user.id;
  const mayDecide = supervisor && request.status === "awaiting_supervisor";
  return (
    <>
      <Link
        className="back-link"
        to={supervisor ? "/manage/approvals" : "/swaps"}
      >
        <ArrowLeft size={16} />
        Back to {supervisor ? "approval inbox" : "swap centre"}
      </Link>
      <FieldErrors error={error} />
      <Feedback message={message} />
      <div className="request-detail-header">
        <div>
          <h2>
            {personName(data, request.requesterId)}{" "}
            <span className="muted">&</span>{" "}
            {personName(data, request.recipientId)}
          </h2>
          <p>
            Requested {dateTime(request.createdAt)} IST · Request {request.id}
          </p>
        </div>
        <Badge status={request.status} />
      </div>
      <div className="workflow-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Assignment & coverage review</h2>
              <p>
                Each person receives the other’s duty, with location and time
                unchanged.
              </p>
            </div>
          </div>
          <div className="panel-body">
            {preview.loading && (
              <Loading label="Checking the current saved roster…" />
            )}
            <ErrorState error={preview.error} retry={() => preview.refresh()} />
            {preview.data && <SwapComparison preview={preview.data} />}
            {request.note && (
              <div className="request-note">
                <h3>Private request note</h3>
                <p>{request.note}</p>
              </div>
            )}
          </div>
        </section>
        <div className="workflow-side">
          {(mayRespond || mayWithdraw || mayDecide) && (
            <Panel title={mayDecide ? "Your decision" : "Next step"}>
              <div className="panel-body">
                <p className="muted">
                  {mayRespond
                    ? "Accept to send this exchange to your supervisor. Your assignments stay unchanged until final approval."
                    : mayDecide
                      ? "Approve only after reviewing both assignments, qualification coverage, and the current checks."
                      : "You can withdraw while the request is awaiting a response or final decision."}
                </p>
                {rejecting ? (
                  <div className="field">
                    <label className="form-label" htmlFor="field-reason">
                      Reason for rejection
                    </label>
                    <textarea
                      id="field-reason"
                      className="form-control"
                      maxLength="500"
                      rows="3"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      aria-invalid={Boolean(error?.fields?.reason)}
                    />
                    <div className="inline-actions">
                      <button
                        className="btn btn-danger"
                        disabled={busy}
                        onClick={() => decide("reject")}
                      >
                        {busy ? "Saving…" : "Confirm rejection"}
                      </button>
                      <button
                        className="btn btn-quiet"
                        disabled={busy}
                        onClick={() => setRejecting(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="decision-actions">
                    {mayRespond && (
                      <>
                        <button
                          className="btn btn-primary"
                          disabled={busy || !preview.data?.eligible}
                          onClick={() => decide("accept")}
                        >
                          <CheckCircle2 size={17} />
                          {busy ? "Saving…" : "Accept exchange"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => decide("decline")}
                        >
                          Decline request
                        </button>
                      </>
                    )}
                    {mayDecide && (
                      <>
                        <button
                          className="btn btn-primary"
                          disabled={busy || !preview.data?.eligible}
                          onClick={() => decide("approve")}
                        >
                          <ShieldCheck size={17} />
                          {busy ? "Saving…" : "Approve exchange"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => setRejecting(true)}
                        >
                          Reject with reason
                        </button>
                      </>
                    )}
                    {mayWithdraw && (
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => decide("withdraw")}
                      >
                        {busy ? "Saving…" : "Withdraw request"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Panel>
          )}
          <Panel title="Request timeline">
            <div className="panel-body">
              <RequestTimeline request={request} users={data.users} />
            </div>
          </Panel>
          <div className="inline-note">
            <Clock3 size={18} aria-hidden="true" />
            <p>
              Pending requests expire when the earlier duty begins. All times
              shown in Asia/Kolkata.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
