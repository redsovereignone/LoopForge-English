import { englishMessage } from "./english-message";
import React, { useEffect, useRef, useState } from "react";
import { api, sessionPath } from "./api.js";
import HarnessIcon from "./HarnessIcon";
import { CredentialAction } from "./ui";
import { CLIInstallAction } from "./cli-install.jsx";
import "./generation-diagnostics.css";

const phases = {
  setup: "Startup and configuration",
  execution: "CLI execution",
  protocol: "Result parsing",
  provider: "Model service",
  connection: "Connecting to model service",
  server: "Platform service",
  orchestration: "Conversation processing",
};
const statuses = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Stopped",
  interrupted: "Interrupted",
  unfinished: "Incomplete",
};
const processStates = {
  not_started: "Not started",
  running: "Running",
  start_failed: "Startup failed",
  exited: "Exited",
  unknown_after_interruption: "Unknown after interruption",
};
const toolSources = {
  gateway: "Platform gateway",
  cli: "CLI protocol",
};
const time = (value) =>
  value ? new Date(value).toLocaleString("en-US", { hour12: false }) : "—";

async function copyText(text) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text);
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  try {
    input.select();
    if (!document.execCommand("copy"))
      throw new Error("Select and copy the diagnostic text");
  } finally {
    input.remove();
  }
}

export default function GenerationDiagnostics({
  sessionId,
  generationId,
  failure,
  onCLIInstall,
  compact = false,
  readOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const identity = `${sessionId}/${generationId}`;
  const current = useRef(identity);
  current.current = identity;
  useEffect(() => {
    setOpen(false);
    setReport(null);
    setNotice("");
    setError("");
    setLoading(false);
  }, [identity]);
  // Read-only viewers (shared conversation links) cannot read the report, so
  // they only see the fixed failure summary without detail actions.
  if (!sessionId || !generationId || (readOnly && compact)) return null;
  const path = `${sessionPath(sessionId)}/generations/${encodeURIComponent(generationId)}/diagnostics`;

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const data = await api(path);
      if (current.current !== identity) return null;
      setReport(data);
      return data;
    } catch (e) {
      if (current.current === identity)
        setError(e.message || "Could not read diagnostics. Try again.");
      return null;
    } finally {
      if (current.current === identity) setLoading(false);
    }
  }
  async function toggle() {
    setOpen(!open);
    if (!open) await load();
  }
  async function copy() {
    const data = await load();
    if (!data) return;
    try {
      await copyText(JSON.stringify(data, null, 2));
      if (current.current === identity) setNotice("Diagnostics copied");
    } catch {
      if (current.current === identity)
        setError("Copy failed. Download the file or copy the details manually.");
    }
  }
  const shown = failure || report?.failure;
  return (
    <section
      className={`generation-diagnostics${compact ? " compact" : " failure"}`}
      aria-label={failure ? "Failure diagnostics" : "Turn diagnostics"}
    >
      {!compact && shown ? (
        <>
          <div className="diagnostic-heading">
            <HarnessIcon name="warning" size={17} aria-hidden="true" />
            <strong>{englishMessage(shown.message)}</strong>
            <code>{shown.code}</code>
          </div>
          {shown.suggestion ? (
            <p className="diagnostic-suggestion">{englishMessage(shown.suggestion)}</p>
          ) : null}
          <CredentialAction text={shown.message} />
          <CLIInstallAction text={shown.message} onResult={onCLIInstall} />
        </>
      ) : null}
      {readOnly ? null : (
        <div className="diagnostic-actions">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            disabled={loading}
          >
            <HarnessIcon
              name={open ? "chevron-down" : "chevron-right"}
              size={14}
              aria-hidden="true"
            />
            {compact ? "Diagnostics" : "View details"}
          </button>
          {!compact || open ? (
            <>
              <button type="button" onClick={copy} disabled={loading}>
                <HarnessIcon name="copy" size={14} aria-hidden="true" />
                Copy diagnostics
              </button>
              <a href={`${path}?download=1`} download>
                <HarnessIcon name="download" size={14} aria-hidden="true" />
                Download diagnostics
              </a>
            </>
          ) : null}
          {loading ? (
            <span role="status">Reading…</span>
          ) : notice ? (
            <span role="status">{notice}</span>
          ) : null}
        </div>
      )}
      {error ? (
        <p className="diagnostic-fetch-error" role="alert">
          {error}
        </p>
      ) : null}
      {open && report ? (
        <div className="diagnostic-details">
          {report.assessment ? (
            <div className="diagnostic-assessment">
              <strong>{englishMessage(report.assessment.summary)}</strong>
              {report.assessment.evidence?.length ? (
                <ul className="diagnostic-list">
                  {report.assessment.evidence.map((item, i) => (
                    <li key={i}>{englishMessage(item)}</li>
                  ))}
                </ul>
              ) : null}
              {report.assessment.unknowns?.length ? (
                <p className="diagnostic-subnote">
                  Scope: {report.assessment.unknowns.map(englishMessage).join(" ")}
                </p>
              ) : null}
              {report.assessment.nextSteps?.length ? (
                <p className="diagnostic-subnote">
                  Suggested checks: {report.assessment.nextSteps.map(englishMessage).join(" ")}
                </p>
              ) : null}
            </div>
          ) : null}
          <dl className="diagnostic-meta">
            <dt>Diagnostic ID</dt>
            <dd>
              <code>{report.generationId}</code>
            </dd>
            <dt>Status</dt>
            <dd>{statuses[report.status] || report.status}</dd>
            <dt>Start time</dt>
            <dd>{time(report.startedAt)}</dd>
            {report.termination ? (
              <>
                <dt>Exit reason</dt>
                <dd>
                  <code>{report.termination.code}</code> ·{" "}
                  {report.termination.message}
                </dd>
              </>
            ) : null}
            {shown?.phase ? (
              <>
                <dt>Failed stage</dt>
                <dd>{phases[shown.phase] || shown.phase}</dd>
              </>
            ) : null}
            {report.environment ? (
              <>
                <dt>Run instance</dt>
                <dd>
                  <code>{report.environment.instanceId}</code> ·{" "}
                  {report.environment.platformVersion}
                  {report.environment.revision
                    ? ` (${report.environment.revision.slice(0, 8)})`
                    : ""}{" "}
                  · {report.environment.os}/{report.environment.arch}
                </dd>
              </>
            ) : null}
          </dl>
          {(report.attempts || []).map((attempt, index) => {
            const proc = attempt.process;
            const lastOut = proc?.lastStdoutAt || proc?.lastStderrAt;
            return (
              <div className="diagnostic-attempt" key={attempt.id}>
                <div className="diagnostic-attempt-heading">
                  <strong>
                    Calls {attempt.id?.split("/").at(-1) || index + 1} ·{" "}
                    {attempt.engine}
                    {attempt.cliVersion ? ` v${attempt.cliVersion}` : ""}
                  </strong>
                  <span>{attempt.model}</span>
                  <span>{statuses[attempt.status] || attempt.status}</span>
                  {attempt.exitCode != null ? (
                    <code>Exit code {attempt.exitCode}</code>
                  ) : null}
                </div>
                <p className="diagnostic-attempt-meta">
                  {attempt.resume ? "Restore conversation" : "New conversation"} ·{" "}
                  {phases[attempt.phase] || attempt.phase} ·{" "}
                  {time(attempt.startedAt)}
                  {attempt.endpoint ? ` · ${attempt.endpoint}` : ""}
                  {attempt.protocol ? ` (${attempt.protocol})` : ""}
                </p>
                {proc ? (
                  <p className="diagnostic-attempt-meta">
                    Process: {processStates[proc.state] || proc.state}
                    {proc.pid ? ` · PID ${proc.pid}` : ""}
                    {proc.signal ? ` · Signal  ${proc.signal}` : ""}
                    {` · Output  ${proc.stdoutLines || 0}/${proc.stderrLines || 0} Ln `}
                    {lastOut ? ` · Latest output  ${time(lastOut)}` : ""}
                  </p>
                ) : null}
                {attempt.firstError && report.dropped?.protocolEvents > 0 ? (
                  <div className="diagnostic-event">
                    <div>
                      <strong>First error</strong>
                      <code>{attempt.firstError.kind}</code>
                      {attempt.firstError.statusCode ? (
                        <span>HTTP {attempt.firstError.statusCode}</span>
                      ) : null}
                    </div>
                    {attempt.firstError.message ? (
                      <pre>{attempt.firstError.message}</pre>
                    ) : null}
                  </div>
                ) : null}
                {attempt.error ? (
                  <pre className="diagnostic-excerpt">{englishMessage(attempt.error)}</pre>
                ) : null}
                {(attempt.events || []).map((event, i) => (
                  <div className="diagnostic-event" key={i}>
                    <div>
                      <code>{event.kind}</code>
                      {event.statusCode ? (
                        <span>HTTP {event.statusCode}</span>
                      ) : null}
                      {event.code ? <code>{event.code}</code> : null}
                      {event.retryable != null ? (
                        <span>{event.retryable ? "Retryable" : "Cannot retry"}</span>
                      ) : null}
                    </div>
                    {event.message ? <pre>{event.message}</pre> : null}
                    {event.requestId ? (
                      <p>
                        Request ID <code>{event.requestId}</code>
                      </p>
                    ) : null}
                    {event.traceId ? (
                      <p>
                        Trace ID <code>{event.traceId}</code>
                      </p>
                    ) : null}
                  </div>
                ))}
                {attempt.firstStderr?.length &&
                report.dropped?.stderrLines > 0 ? (
                  <details className="diagnostic-stderr">
                    <summary>
                      First CLI output · first {attempt.firstStderr.length} lines
                    </summary>
                    <pre>{attempt.firstStderr.join("\n")}</pre>
                  </details>
                ) : null}
                {attempt.stderr?.length ? (
                  <details className="diagnostic-stderr">
                    <summary>
                      CLI errors · last {attempt.stderr.length} lines
                    </summary>
                    <pre>{attempt.stderr.join("\n")}</pre>
                  </details>
                ) : null}
              </div>
            );
          })}
          {report.tools?.length ? (
            <details
              className="diagnostic-stderr"
              open={report.tools.some((t) => t.status !== "completed")}
            >
              <summary>Tool and gateway calls · {report.tools.length}  times</summary>
              <div className="diagnostic-tools">
                {report.tools.map((tool, i) => (
                  <div className="diagnostic-event" key={`${tool.id}-${i}`}>
                    <div>
                      <code>{tool.name}</code>
                      <span>{toolSources[tool.source] || tool.source}</span>
                      <span>{statuses[tool.status] || tool.status}</span>
                      {tool.exitCode != null ? (
                        <code>Exit code {tool.exitCode}</code>
                      ) : null}
                    </div>
                    {tool.error ? <pre>{englishMessage(tool.error)}</pre> : null}
                    {tool.requestId ? (
                      <p>
                        Request ID <code>{tool.requestId}</code>
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {report.timeline?.length ? (
            <details className="diagnostic-stderr">
              <summary>Execution timeline · {report.timeline.length}  records</summary>
              <pre>
                {report.timeline
                  .map(
                    (e) =>
                      `[${time(e.at)}] (${e.source || "cli"}) ${e.kind}${e.tool ? ` ${e.tool}` : ""}${e.code ? ` [${e.code}]` : ""}${e.message ? ` — ${e.message}` : ""}`,
                  )
                  .join("\n")}
              </pre>
            </details>
          ) : null}
          {report.error &&
          !report.attempts?.some((attempt) => attempt.error) ? (
            <pre className="diagnostic-excerpt">{englishMessage(report.error)}</pre>
          ) : null}
          {!report.attempts?.length && !report.error ? (
            <p className="diagnostic-note">No CLI calls recorded.</p>
          ) : null}
          <p className="diagnostic-note">
            Sensitive details are redacted. Request and trace IDs appear only when the CLI
             or provider returns them.
            {report.truncated ? "Some records were truncated to fit the size limit." : ""}
          </p>
          {report.status === "running" ? (
            <button
              type="button"
              className="diagnostic-refresh"
              onClick={load}
              disabled={loading}
            >
              Refresh diagnostics
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
