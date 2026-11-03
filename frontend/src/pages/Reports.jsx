import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Download, Printer } from "lucide-react";
import { useWorkspace } from "../context.jsx";
import { useApi } from "../hooks/useApi.js";
import { path } from "../services/api.js";
import { dateTime, labName, statusLabel, weekLabel } from "../utils/dates.js";
import {
  Avatar,
  Badge,
  DataTable,
  ErrorState,
  Loading,
  Panel,
} from "../components/UI.jsx";
import { CoverageTable } from "../components/Roster.jsx";

export function CanvasWorkloadChart({ rows }) {
  const canvas = useRef(null);
  const wrapper = useRef(null);
  useEffect(() => {
    const draw = () => {
      const element = canvas.current;
      const container = wrapper.current;
      // A queued ResizeObserver callback may run after a report refresh unmounts its chart.
      if (!element || !container) return;
      const width = container.clientWidth;
      if (!width) return;
      const height = Math.max(160, rows.length * 34 + 40);
      const ratio = window.devicePixelRatio || 1;
      element.width = width * ratio;
      element.height = height * ratio;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      const context = element.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      const styles = getComputedStyle(document.documentElement);
      const ink = styles.getPropertyValue("--color-muted").trim();
      const accent = styles.getPropertyValue("--color-chart").trim();
      const rule = styles.getPropertyValue("--color-border").trim();
      const labelWidth = width < 500 ? Math.min(115, width * 0.38) : 195;
      const graphWidth = Math.max(30, width - labelWidth - 34);
      const max = Math.max(
        3,
        Math.ceil(Math.max(0, ...rows.map((row) => Number(row.hours))) / 3) * 3,
      );
      context.font = `12px ${styles.getPropertyValue("--font-body")}`;
      for (let step = 0; step <= 3; step++) {
        const x = labelWidth + (graphWidth * step) / 3;
        context.strokeStyle = rule;
        context.beginPath();
        context.moveTo(x, 24);
        context.lineTo(x, height - 10);
        context.stroke();
        context.fillStyle = ink;
        context.textAlign = "center";
        context.fillText(`${Math.round((max * step) / 3)}h`, x, 13);
      }
      rows.forEach((row, index) => {
        const y = 29 + index * 34;
        let name = row.name;
        while (
          context.measureText(name).width > labelWidth - 14 &&
          name.length > 2
        )
          name = `${name.slice(0, name.endsWith("…") ? -2 : -1)}…`;
        context.fillStyle = ink;
        context.textAlign = "left";
        context.fillText(name, 0, y + 14);
        const barWidth = (graphWidth * Number(row.hours)) / max;
        context.fillStyle = accent;
        context.beginPath();
        context.roundRect(
          labelWidth,
          y,
          Math.max(row.hours ? 3 : 0, barWidth),
          20,
          4,
        );
        context.fill();
        context.fillStyle = ink;
        context.fillText(String(row.hours), labelWidth + barWidth + 7, y + 14);
      });
    };
    const observer = new ResizeObserver(draw);
    observer.observe(wrapper.current);
    draw();
    return () => observer.disconnect();
  }, [rows]);
  return (
    <figure className="workload-chart" ref={wrapper}>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Scheduled hours for each person. Exact values are in the table below."
      />
      <figcaption>
        Scheduled hours · same records as the table and CSV export below
      </figcaption>
    </figure>
  );
}
export default function ReportsPage({ personal = false }) {
  const { data, week, registerRefresh } = useWorkspace();
  const [lab, setLab] = useState("all");
  const [tab, setTab] = useState("workload");
  const [state, setState] = useState("all");
  const [staff, setStaff] = useState("all");
  const report = useApi(
    "report",
    { week, lab, status: state, staffId: staff },
    true,
    { revision: data.revision },
  );
  useEffect(
    () => registerRefresh("report", report.refresh),
    [registerRefresh, report.refresh],
  );
  const swapRows = (report.data?.swaps || []).filter(
    (request) =>
      (state === "all" || request.status === state) &&
      (staff === "all" ||
        [request.requesterId, request.recipientId].includes(staff)),
  );
  const exportParams = new URLSearchParams({
    week,
    lab,
    type: personal ? "workload" : tab,
    ...(tab === "swaps" ? { status: state, staffId: staff } : {}),
  });
  const historyExport = path(
    `/reports/export.php?${new URLSearchParams({ week, lab, type: "swaps", status: state, staffId: staff })}`,
  );
  const ready = Boolean(report.data && !report.loading && !report.error);
  return (
    <>
      <div className="report-scope-bar">
        <div>
          <strong>{weekLabel(week)}</strong>
          <span>
            {labName(lab)} ·{" "}
            {personal
              ? "Your published assignments"
              : "Published assignments only"}
          </span>
        </div>
        <div className="inline-actions">
          <label className="visually-hidden" htmlFor="report-lab">
            Report laboratory
          </label>
          <select
            className="form-select compact-select"
            id="report-lab"
            value={lab}
            onChange={(event) => setLab(event.target.value)}
          >
            <option value="all">All laboratories</option>
            <option value="lab-a">Lab A</option>
            <option value="lab-b">Lab B</option>
          </select>
          <a
            className="btn btn-secondary"
            aria-disabled={!ready}
            href={
              ready ? path(`/reports/export.php?${exportParams}`) : undefined
            }
          >
            <Download size={16} />
            Export CSV
          </a>
          <button
            className="btn btn-secondary"
            disabled={!ready}
            onClick={() => window.print()}
          >
            <Printer size={16} />
            Print
          </button>
        </div>
      </div>
      {!personal && (
        <div className="segmented-control report-tabs" aria-label="Report type">
          {[
            ["workload", "Scheduled workload"],
            ["coverage", "Coverage"],
            ["swaps", "Swap history"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {report.loading && <Loading label="Preparing the selected report…" />}
      <ErrorState error={report.error} retry={() => report.refresh()} />
      {report.error && report.data && (
        <p className="muted">
          This is the last successful report snapshot. Reload it before
          exporting or printing.
        </p>
      )}
      {report.data && !report.loading && (
        <>
          <div className="metric-strip report-metrics">
            <div>
              <span>Scheduled hours</span>
              <strong>
                {report.data.totals.hours}
                <small> h</small>
              </strong>
              <p>Published duties in this scope</p>
            </div>
            <div>
              <span>Assigned duties</span>
              <strong>{report.data.totals.duties}</strong>
              <p>People counted once per assignment</p>
            </div>
            {!personal && (
              <>
                <div>
                  <span>Missing people</span>
                  <strong>{report.data.totals.missingPeople}</strong>
                  <p>Unfilled headcount positions</p>
                </div>
                <div>
                  <span>Missing technicians</span>
                  <strong>{report.data.totals.missingTechnicians}</strong>
                  <p>Unmet qualification positions</p>
                </div>
              </>
            )}
          </div>
          {(tab === "workload" || personal) && (
            <Panel
              title={
                personal ? "Your scheduled workload" : "Scheduled workload"
              }
              description="These are planned duty hours, not verified hours worked."
            >
              <div className="panel-body">
                <CanvasWorkloadChart rows={report.data.workload} />
              </div>
              <DataTable
                caption={`Scheduled workload for ${weekLabel(week)}, ${labName(lab)}`}
                rowKey="staffId"
                rows={report.data.workload}
                columns={[
                  {
                    key: "name",
                    label: "Team member",
                    render: (person) => (
                      <div className="staff-cell">
                        <Avatar small name={person.name} />
                        <strong>{person.name}</strong>
                      </div>
                    ),
                  },
                  {
                    key: "qualification",
                    label: "Qualification",
                    render: (person) =>
                      person.qualification === "technician"
                        ? "Technician"
                        : "Lab assistant",
                  },
                  {
                    key: "duties",
                    label: "Duties",
                    numeric: true,
                    render: (person) => (
                      <span>
                        {person.duties}
                        {!person.duties && (
                          <small className="cell-secondary">
                            No assignments
                          </small>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: "hours",
                    label: "Scheduled hours",
                    numeric: true,
                    render: (person) => <strong>{person.hours} h</strong>,
                  },
                ]}
              />
            </Panel>
          )}
          {tab === "coverage" && !personal && (
            <Panel
              title="Coverage by duty block"
              description="Technicians count toward the total headcount and the qualification requirement."
            >
              <CoverageTable rows={report.data.coverage} />
            </Panel>
          )}
          {(tab === "swaps" || personal) && (
            <Panel
              title={personal ? "Your exchange history" : "Swap history"}
              className={personal ? "summary-history" : ""}
              description="Grouped by the duties’ roster week; request creation time may fall in a different week."
              action={
                <div className="inline-actions">
                  {personal && (
                    <a
                      className="btn btn-secondary"
                      href={ready ? historyExport : undefined}
                      aria-disabled={!ready}
                    >
                      <Download size={16} />
                      Export history CSV
                    </a>
                  )}
                  <label className="visually-hidden" htmlFor="history-status">
                    History status
                  </label>
                  <select
                    className="form-select compact-select"
                    id="history-status"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
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
                  {!personal && (
                    <>
                      <label
                        className="visually-hidden"
                        htmlFor="history-staff"
                      >
                        Involved staff
                      </label>
                      <select
                        id="history-staff"
                        className="form-select compact-select"
                        value={staff}
                        onChange={(event) => setStaff(event.target.value)}
                      >
                        <option value="all">All staff</option>
                        {data.users
                          .filter((person) => person.role === "staff")
                          .map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                </div>
              }
            >
              <DataTable
                caption="Exchange history for the selected roster scope"
                rows={swapRows}
                columns={[
                  {
                    key: "requester",
                    label: "Requested by",
                    render: (request) =>
                      request.requesterName ||
                      data.users.find(
                        (person) => person.id === request.requesterId,
                      )?.name ||
                      "—",
                  },
                  {
                    key: "recipient",
                    label: "Colleague",
                    render: (request) =>
                      request.recipientName ||
                      data.users.find(
                        (person) => person.id === request.recipientId,
                      )?.name ||
                      "—",
                  },
                  {
                    key: "status",
                    label: "State",
                    render: (request) => <Badge status={request.status} />,
                  },
                  {
                    key: "createdAt",
                    label: "Requested",
                    render: (request) =>
                      request.createdAt
                        ? dateTime(request.createdAt) + " IST"
                        : "—",
                  },
                  {
                    key: "details",
                    label: "Request",
                    render: (request) => (
                      <Link className="text-link" to={`/swaps/${request.id}`}>
                        Details
                        <ArrowRight size={14} />
                      </Link>
                    ),
                  },
                ]}
              />
            </Panel>
          )}
          <p className="report-footnote">
            Two-way exchanges change assignment owners; they do not create
            additional filled places. All scope dates and duty times use
            Asia/Kolkata.
          </p>
        </>
      )}
    </>
  );
}
