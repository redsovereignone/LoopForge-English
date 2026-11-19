import React, { useEffect, useState } from "react";
import HarnessIcon from "./HarnessIcon";
import { api } from "./api";
import { Dialog } from "./ui";
export function issueHref(id, projectId) {
  return `/?projectId=${encodeURIComponent(projectId)}&issueId=${encodeURIComponent(id)}#/issues`;
}
export default function IssueContext({
  chat,
  open: controlledOpen,
  onClose,
  hideTrigger = false,
}) {
  const [issue, setIssue] = useState(null),
    [internalOpen, setInternalOpen] = useState(false),
    [query, setQuery] = useState(""),
    [rows, setRows] = useState([]),
    [next, setNext] = useState(0),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const open = controlledOpen ?? internalOpen;
  const unavailable =
    !chat.projectId ||
    chat.busy ||
    (chat.activeId && !chat.session) ||
    chat.session?.shared ||
    chat.readOnly;
  function close() {
    setInternalOpen(false);
    onClose?.();
  }
  useEffect(() => {
    let current = true;
    setIssue(null);
    if (chat.issueId)
      api(`/api/issues/${encodeURIComponent(chat.issueId)}`)
        .then((data) => {
          if (current) setIssue(data.issue || data);
        })
        .catch(() => {});
    return () => {
      current = false;
    };
  }, [chat.issueId, chat.activeId]);
  useEffect(() => {
    if (!open || unavailable) return;
    let current = true;
    setRows([]);
    setError("");
    setNext(0);
    setLoading(true);
    const timer = setTimeout(() => {
      api(
        "/api/assistant/references?" +
          new URLSearchParams({
            projectId: chat.projectId,
            type: "issue",
            q: query,
          }),
      )
        .then((data) => {
          if (current) {
            setRows(data.items || data);
            setNext(data.nextOffset || 0);
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 150);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [open, chat.projectId, query, unavailable]);
  async function choose(id) {
    if (unavailable || saving) return;
    setSaving(true);
    try {
      if (await chat.linkIssue(id)) {
        close();
        setQuery("");
      }
    } finally {
      setSaving(false);
    }
  }
  async function more() {
    if (unavailable || loading) return;
    setLoading(true);
    try {
      const data = await api(
        "/api/assistant/references?" +
          new URLSearchParams({
            projectId: chat.projectId,
            type: "issue",
            q: query,
            offset: String(next),
          }),
      );
      setRows((old) => [...old, ...(data.items || data)]);
      setNext(data.nextOffset || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      {!hideTrigger ? (
        <>
          <button
            type="button"
            className="context-pill issue-context"
            title={
              chat.session?.shared
                ? "Linked by the current run"
                : "Link the conversation’s main requirement. Other mentions apply to one message."
            }
            disabled={unavailable}
            onClick={() => setInternalOpen(true)}
          >
            <HarnessIcon name="doc" size={14} />
            <span>
              {chat.issueId ? issue?.title || chat.issueId : "Linked requirements"}
            </span>
          </button>
          {chat.issueId ? (
            <a
              className="issue-open"
              href={issueHref(chat.issueId, chat.projectId)}
              target="_blank"
              rel="noreferrer"
              title="Open linked requirement"
              aria-label="Open linked requirement"
            >
              <HarnessIcon name="preview-expand" size={13} />
            </a>
          ) : null}
        </>
      ) : null}
      {open ? (
        <Dialog title="Main requirement" onClose={close}>
          <div className="issue-selector">
            <p>
              Link a requirement to read its latest version each turn. Conversation visibility stays the same.
            </p>
            {chat.issueId ? (
              <p>
                Linked:{" "}
                <a
                  href={issueHref(chat.issueId, chat.projectId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {issue?.title || chat.issueId}
                </a>
              </p>
            ) : null}
            <input
              autoFocus
              aria-label="Search requirements"
              placeholder="Search this project’s requirements…"
              value={query}
              disabled={unavailable || saving}
              onChange={(e) => setQuery(e.target.value)}
            />
            {chat.issueId ? (
              <button
                type="button"
                className="quiet-button"
                disabled={unavailable || saving}
                onClick={() => choose("")}
              >
                Unlink
              </button>
            ) : null}
            <div className="issue-options">
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  disabled={unavailable || saving}
                  onClick={() => choose(row.id)}
                  aria-pressed={chat.issueId === row.id}
                >
                  <HarnessIcon name="doc" size={16} />
                  <span>
                    {row.name}
                    <small>{row.id}</small>
                  </span>
                  {chat.issueId === row.id ? "Linked" : ""}
                </button>
              ))}
            </div>
            {loading ? <p role="status">Searching…</p> : null}
            {!loading && !rows.length && !error ? (
              <p>No matches. Create or import a requirement in chat.</p>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
            {next ? (
              <button
                className="quiet-button"
                disabled={loading || unavailable || saving}
                onClick={more}
              >
                Load more
              </button>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
