import { useEffect, useRef, useState } from "react";
import HarnessIcon from "./HarnessIcon";
import { IconButton } from "./ui";
import { branchCompareUrl } from "./changes";
import "./changes-panel.css";

// Rendering a huge generated file line by line is slower than it is useful.
const MAX_LINES = 2000;
const NO_FILES = [];

function diffRows(patch) {
  const rows = [];
  for (const hunk of patch?.hunks || []) {
    rows.push({ kind: "hunk", header: hunk.header, section: hunk.section });
    for (const line of hunk.lines || []) rows.push(line);
  }
  return rows;
}

function DiffLine({ line }) {
  return (
    <div className={`diff-line is-${line.kind}`}>
      <span className="diff-no" aria-hidden="true">
        {line.kind === "add" ? "" : line.oldNo || ""}
      </span>
      <span className="diff-no" aria-hidden="true">
        {line.kind === "del" ? "" : line.newNo || ""}
      </span>
      <span className="diff-mark" aria-hidden="true">
        {line.kind === "add" ? "+" : line.kind === "del" ? "-" : ""}
      </span>
      <span className="diff-text">{line.text || " "}</span>
    </div>
  );
}

function FileRow({ file, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`change-row ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      title={file.path}
      aria-current={selected ? "true" : undefined}
    >
      <span className={`change-status is-${file.status}`} aria-label={file.label}>
        {file.status}
      </span>
      <span className="change-copy">
        <strong>{file.name}</strong>
        <small>{file.dir || file.repository || "Workspace root"}</small>
      </span>
      <span className="change-stat">
        {file.additions ? <i className="is-add">+{file.additions}</i> : null}
        {file.deletions ? <i className="is-del">−{file.deletions}</i> : null}
        {file.untracked ? <i className="is-new">Untracked</i> : null}
      </span>
      <HarnessIcon name="chevron-right" size={13} className="change-row-arrow" />
    </button>
  );
}

// What the empty state has to explain: this view only reads the working tree,
// so a session that committed or pushed still shows nothing here. Naming the
// branches and linking to the code host keeps that case from looking like a broken panel.
function BranchEntry({ repository }) {
  const compareUrl = branchCompareUrl(repository);
  if (!repository?.workBranch) return null;
  return (
    <>
      <small className="changes-branch">
        Working branch <code>{repository.workBranch}</code>
        {repository.baseBranch && repository.baseBranch !== repository.workBranch ? (
          <>
            , baseline  <code>{repository.baseBranch}</code>
          </>
        ) : null}
      </small>
      {compareUrl ? (
        <a
          className="changes-branch-link"
          href={compareUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <HarnessIcon name="preview-expand" size={13} />
          View branch changes in the repository
        </a>
      ) : null}
    </>
  );
}

function EmptyChanges({ repository }) {
  return (
    <div className="changes-empty">
      <HarnessIcon name="git" size={24} />
      <p>No uncommitted changes.</p>
      {repository?.workBranch ? null : (
        <small>Files changed by the assistant or by commands appear here, compared with HEAD.</small>
      )}
      <small>Committed or pushed changes are excluded.</small>
      <BranchEntry repository={repository} />
    </div>
  );
}

// The "改动" view of the conversation side panel: every file the agent touched
// in the workspace, with a line-by-line diff. The workspace git state is the
// source of truth, so files changed by shell commands show up too.
export default function ChangesPanel({ changes }) {
  const [selectedPath, setSelectedPath] = useState("");
  const [patches, setPatches] = useState({});
  const [loadingPath, setLoadingPath] = useState("");
  const [error, setError] = useState("");
  const inflight = useRef(new Set());
  const files = changes?.files || NO_FILES;
  const selected = files.find((file) => file.path === selectedPath) || null;
  const loadFile = changes?.loadFile;
  // The run records its own branches; the workspace payload only carries names.
  const repository = changes?.repositories?.[0] || null;

  useEffect(() => {
    if (selectedPath && !selected) setSelectedPath("");
  }, [selectedPath, selected]);

  useEffect(() => {
    if (!selected || selected.patch || patches[selected.path]) return;
    if (inflight.current.has(selected.path)) return;
    if (!loadFile) return;
    inflight.current.add(selected.path);
    setLoadingPath(selected.path);
    setError("");
    loadFile(selected)
      .then((patch) => {
        setPatches((previous) => ({ ...previous, [selected.path]: patch }));
      })
      .catch((reason) => setError(reason.message))
      .finally(() => {
        inflight.current.delete(selected.path);
        setLoadingPath("");
      });
  }, [selected, patches, loadFile]);

  const status = changes?.status || "idle";
  const toolbar = (
    <div className="changes-toolbar">
      <span className="changes-summary">
        {files.length ? (
          <>
            <strong>{files.length}</strong> files
            <i className="is-add">+{changes.additions || 0}</i>
            <i className="is-del">−{changes.deletions || 0}</i>
          </>
        ) : (
          "Compared with HEAD"
        )}
      </span>
      <IconButton label="Refresh changes" onClick={changes?.refresh}>
        <HarnessIcon name="refresh" size={14} />
      </IconButton>
    </div>
  );

  if (selected) {
    const patch = selected.patch || patches[selected.path] || null;
    const rows = diffRows(patch);
    const shown = rows.length > MAX_LINES ? rows.slice(0, MAX_LINES) : rows;
    return (
      <div className="changes-panel is-detail">
        <div className="changes-detail-bar">
          <button
            type="button"
            className="changes-back"
            onClick={() => setSelectedPath("")}
          >
            <HarnessIcon name="chevron-left" size={13} />
            <span>Back to changes</span>
          </button>
          <span className="changes-detail-path" title={selected.path}>
            {selected.path}
          </span>
        </div>
        <div className="changes-diff">
          {loadingPath === selected.path ? (
            <p className="changes-note">Loading changes…</p>
          ) : error ? (
            <p className="changes-note is-error" role="alert">
              {error}
            </p>
          ) : !patch ? (
            <p className="changes-note">
              No text diff is available. The file may be binary or too large.
            </p>
          ) : patch.binary ? (
            <p className="changes-note">Binary file. No line-by-line diff is available.</p>
          ) : rows.length ? (
            <>
              {selected.untracked ? (
                <p className="changes-note">
                  This file is untracked. Its full contents are shown below.
                </p>
              ) : null}
              <div className="diff-body">
                {shown.map((row, index) =>
                  row.kind === "hunk" ? (
                    <div className="diff-hunk" key={`h${index}`}>
                      <span>{row.header}</span>
                      {row.section ? <em>{row.section}</em> : null}
                    </div>
                  ) : (
                    <DiffLine key={`l${index}`} line={row} />
                  ),
                )}
              </div>
              {rows.length > shown.length ? (
                <p className="changes-note">
                  Large diff. Showing the first  {MAX_LINES}  lines of  {rows.length} .
                </p>
              ) : null}
            </>
          ) : (
            <p className="changes-note">The file contents are identical.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="changes-panel">
      {toolbar}
      {changes?.warning ? (
        <p className="changes-note is-error" role="alert">
          {changes.warning}
        </p>
      ) : null}
      {status === "loading" ? (
        <p className="changes-note">Loading workspace changes…</p>
      ) : status === "unavailable" || status === "error" ? (
        <div className="changes-empty">
          <HarnessIcon name="git" size={24} />
          <p>{changes?.reason || "Workspace unavailable."}</p>
          <small>Changes will appear when the workspace is ready.</small>
          {status === "unavailable" ? <BranchEntry repository={repository} /> : null}
        </div>
      ) : status === "idle" ? (
        <div className="changes-empty">
          <HarnessIcon name="git" size={24} />
          <p>This conversation has no workspace yet.</p>
          <small>Changes will appear when the assistant edits code.</small>
        </div>
      ) : files.length ? (
        <div className="changes-list" role="list">
          {files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              selected={file.path === selectedPath}
              onSelect={() => setSelectedPath(file.path)}
            />
          ))}
        </div>
      ) : (
        <EmptyChanges repository={repository} />
      )}
      {changes?.truncated ? (
        <p className="changes-note">
          The diff exceeds the preview limit. Some line counts may be incomplete.
        </p>
      ) : null}
      <p className="changes-footnote">
        Review uncommitted changes against HEAD before submitting an MR, including files changed by commands.
      </p>
    </div>
  );
}
