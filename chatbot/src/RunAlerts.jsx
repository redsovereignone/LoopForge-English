import { englishMessage } from "./english-message";
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import HarnessIcon from "./HarnessIcon";
import {
  credentialGuide,
  credentialHint,
  openCredentialSettings,
} from "./credentials";
import { runProblems } from "./runs.js";
import { IconButton } from "./ui";
import "./run-alerts.css";

const DISMISSED_KEY = "agentflow.native-chat.run-alerts.dismissed";
// Fade-out (180ms) followed by the height collapse (260ms); see run-alerts.css.
const LEAVE_MS = 440;
function readDismissed() {
  try {
    const value = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function openRunPage(runId) {
  if (window.parent !== window)
    window.parent.postMessage(
      { type: "agentflow-chat-open-view", view: "runs", runId },
      location.origin,
    );
  else location.href = `/#/runs/${encodeURIComponent(runId)}`;
}
const prefersReducedMotion = () =>
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// RunAlerts surfaces failed and waiting SOP nodes of this conversation in the
// message stream, so nobody has to open the node panel to learn that a run is
// stuck, why, and what fixes it.
export default function RunAlerts({
  runs,
  user,
  users = [],
  readOnly,
  onOpenNode,
  onAsk,
  onChanged,
}) {
  const [dismissed, setDismissed] = useState(readDismissed);
  const [leaving, setLeaving] = useState(() => new Set());
  // Keys whose entrance already played; polling re-renders and remounts must
  // not replay it.
  const settled = useRef(new Set());
  // Stagger slot fixed when a key is first seen, so re-renders mid-entrance
  // do not shift the delay.
  const slots = useRef(new Map());
  const timers = useRef(new Map());
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);
  const persist = (key) => {
    const next = [...readDismissed().filter((k) => k !== key), key].slice(-200);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    return next;
  };
  const finish = useCallback((key) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    // Only this key: others still leaving are already persisted and must
    // finish their own exit before being filtered out.
    setDismissed((old) => (old.includes(key) ? old : [...old, key]));
    setLeaving((old) => {
      if (!old.has(key)) return old;
      const rest = new Set(old);
      rest.delete(key);
      return rest;
    });
  }, []);
  const dismiss = (key) => {
    if (timers.current.has(key)) return;
    // Stored right away so an unmount mid-animation cannot lose it.
    persist(key);
    if (prefersReducedMotion()) return finish(key);
    setLeaving((old) => new Set(old).add(key));
    timers.current.set(
      key,
      setTimeout(() => finish(key), LEAVE_MS + 60),
    );
  };
  const items = runs
    .flatMap((run) => runProblems(run).map((problem) => ({ ...problem, run })))
    .filter((item) => !dismissed.includes(item.key));
  if (!items.length) return null;
  let entering = 0;
  for (const item of items)
    if (!settled.current.has(item.key) && !slots.current.has(item.key))
      slots.current.set(item.key, entering++);
  return (
    <div className="run-alerts" aria-label="Run alert">
      {items.map((item) => {
        const isSettled = settled.current.has(item.key);
        const order = isSettled ? 0 : (slots.current.get(item.key) ?? 0);
        const isLeaving = leaving.has(item.key);
        return (
          <div
            key={item.key}
            className={`run-alert-shell${isLeaving ? " is-leaving" : ""}`}
            onTransitionEnd={(e) => {
              if (
                isLeaving &&
                e.target === e.currentTarget &&
                e.propertyName === "grid-template-rows"
              )
                finish(item.key);
            }}
          >
            <div className="run-alert-clip">
              <RunAlert
                item={item}
                user={user}
                users={users}
                readOnly={readOnly}
                settled={isSettled}
                order={order}
                onEntered={() => settled.current.add(item.key)}
                onDismiss={() => dismiss(item.key)}
                onOpenNode={onOpenNode}
                onAsk={onAsk}
                onChanged={onChanged}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RunAlert({
  item,
  user,
  users,
  readOnly,
  settled,
  order,
  onEntered,
  onDismiss,
  onOpenNode,
  onAsk,
  onChanged,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { run } = item;
  const failed = item.kind === "failed";
  const hint = credentialHint(item.reason);
  const ownerId = run.executionContext?.responsibleUserId;
  const mine = !ownerId || ownerId === user?.id;
  const owner = users.find((u) => u.id === ownerId);
  const guide = hint
    ? credentialGuide(
        hint.field,
        mine ? users.find((u) => u.id === user?.id) || user : owner,
      )
    : null;
  const ownerName =
    owner?.chineseName || owner?.name || owner?.loginName || "Run owner";
  const flag = hint ? `${hint.field}Configured` : "";
  const configured =
    mine && hint && !!(users.find((u) => u.id === user?.id) || user)?.[flag];
  // The engine says 未配置 when the token was absent at failure time; a token
  // present now was then added afterwards and a retry is all that is left.
  const fixedSince = configured && /未配置/.test(item.reason);
  const showFix = !!(hint && guide);
  // At most one filled button per card: fixing the credential comes first.
  const retryPrimary = !showFix || fixedSince;
  const tag = busy
    ? "Retrying"
    : failed
      ? "Execution failed"
      : item.gate === "approval"
        ? "Human gate"
        : "Needs review";
  async function retry() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/runs/${encodeURIComponent(run.id)}/retry`, {
        method: "POST",
        body: JSON.stringify({ nodeId: item.nodeId, expected: item.expected }),
      });
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={[
        "run-alert",
        `run-alert-${failed ? "failed" : "waiting"}`,
        busy ? "is-busy" : "",
        settled ? "is-settled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ "--ra-i": order }}
      role="status"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) onEntered();
      }}
    >
      <header className="run-alert-head">
        <span className="run-alert-lamp" aria-hidden="true" />
        <div className="run-alert-title">
          <div className="run-alert-title-row">
            <strong>“{item.nodeName}”</strong>
            <span className="run-alert-tag">{tag}</span>
          </div>
          <span className="run-alert-meta">
            {run.workflowSnapshot?.name || "SOP run"} · <code>{run.id}</code>
          </span>
        </div>
        <IconButton
          label="Dismiss future alerts"
          className="run-alert-close"
          onClick={onDismiss}
        >
          <HarnessIcon name="close" size={15} />
        </IconButton>
      </header>
      <div className="run-alert-body">
        <RunAlertReason text={englishMessage(item.reason)} />
        {showFix ? (
          <div className={`run-alert-fix${fixedSince ? " is-ok" : ""}`}>
            <div className="run-alert-fix-title">
              <HarnessIcon
                name={fixedSince ? "check" : "warning"}
                size={13}
                interactive={false}
                aria-hidden="true"
              />
              <span>
                {fixedSince
                  ? `Detected that you have configured${hint.label}, click 'Retry Node' to continue`
                  : configured
                    ? `Your${hint.label}is configured. If you configured it after the failure, click 'Retry Node' directly; otherwise, it may be invalid, expired, or lack sufficient permissions. Please follow the steps below to regenerate it`
                    : mine
                      ? `Reason: Your${hint.label}is not configured or invalid`
                      : `Reason: ${ownerName}${hint.label}is not configured or invalid`}
              </span>
            </div>
            {!fixedSince ? (
              <ol>
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
            {!mine ? (
              <small>
                This run uses the personal credentials of the responsible person, {ownerName}{" "}
                Configuring your own will not take effect; please send the steps above to them.
              </small>
            ) : null}
            {!fixedSince && (mine || guide.url) ? (
              <div className="run-alert-actions">
                {mine ? (
                  <button
                    type="button"
                    className="run-alert-btn primary"
                    onClick={() => openCredentialSettings(hint.field)}
                  >
                    <HarnessIcon name="key" size={14} aria-hidden="true" />
                    Configure {hint.label}
                  </button>
                ) : null}
                {guide.url ? (
                  <a
                    className="run-alert-btn link"
                    href={guide.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {guide.link}
                    <HarnessIcon
                      name="arrow-right"
                      size={13}
                      aria-hidden="true"
                    />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="run-alert-actions">
          {failed && !readOnly ? (
            <button
              type="button"
              className={`run-alert-btn${retryPrimary ? " primary" : ""}${busy ? " is-spinning" : ""}`}
              disabled={busy}
              onClick={retry}
            >
              <HarnessIcon name="refresh" size={14} aria-hidden="true" />
              {busy ? "Retrying…" : "Retry step"}
            </button>
          ) : null}
          {!failed ? (
            <button
              type="button"
              className={`run-alert-btn${readOnly ? "" : " primary"}`}
              onClick={() => openRunPage(run.id)}
            >
              <HarnessIcon name="arrow-right" size={14} aria-hidden="true" />
              Review
            </button>
          ) : null}
          <button
            type="button"
            className="run-alert-btn"
            onClick={() => onOpenNode(run, item.nodeId)}
          >
            <HarnessIcon name="chat-artifacts" size={14} aria-hidden="true" />
            View step
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="run-alert-btn"
              onClick={() => onAsk(item)}
            >
              <HarnessIcon name="chat" size={14} aria-hidden="true" />Ask AI to analyze
            </button>
          ) : null}
        </div>
        {error ? (
          <div className="run-alert-error" role="alert">
            <HarnessIcon
              name="warning"
              size={13}
              interactive={false}
              aria-hidden="true"
            />
            <span>{englishMessage(error)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

// The reason shows three lines; the toggle appears only when the text is
// really clipped at the current width.
function RunAlertReason({ text }) {
  const [open, setOpen] = useState(false);
  const [clipped, setClipped] = useState(false);
  const clamp = useRef(null);
  const id = useId();
  useLayoutEffect(() => {
    const node = clamp.current;
    if (!node) return;
    const measure = () => {
      // Hidden while open; keep the last answer.
      if (!node.clientHeight) return;
      setClipped(node.scrollHeight > node.clientHeight + 1);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);
  const expandable = clipped || open;
  return (
    <div className={`run-alert-reason${open ? " is-open" : ""}`}>
      <div className="run-alert-reason-text" ref={clamp}>
        {text}
      </div>
      {expandable ? (
        <>
          <div
            className="run-alert-reason-full"
            id={id}
            aria-hidden={!open}
            inert={!open ? true : undefined}
          >
            <div>
              <p>{text}</p>
            </div>
          </div>
          <button
            type="button"
            className="run-alert-toggle"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((v) => !v)}
          >
            <span>{open ? "Collapse" : "Show full reason"}</span>
            <HarnessIcon
              name="chevron-down"
              size={12}
              interactive={false}
              aria-hidden="true"
            />
          </button>
        </>
      ) : null}
    </div>
  );
}
