import { englishMessage } from "./english-message";
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "../../web/app/git-ssh.js";
import HarnessIcon from "./HarnessIcon";
import SlidingTabs from "./SlidingTabs";
import { api, canChatInProject, canManageProjectRepos, write } from "./api";
import { usePanelPresence } from "./usePanelPresence";
import {
  CODEBUDDY_ENVIRONMENTS,
  codeBuddyEnvironment,
  codeBuddyEnvironmentIntent,
  codeBuddyEnvironmentLegacy,
  codeBuddyKeyURL,
  codeBuddyKeyWarning,
  openCredentialSettings,
} from "./credentials";
import "./quick-access-wizard.css";

const DEFAULT_SOP_ID = "generic-backend-delivery";

// Display names for the models users without their own key may use.
export function sharedModelNames(models, fallback = "") {
  const list = Array.isArray(models) && models.length ? models : fallback ? [fallback] : [];
  return list
    .map((id) => (id === "deepseek-v4.1-flash" ? "Deepseek-V4.1-Flash" : id))
    .join(", ");
}

// The users API omits an empty (国际站) environment, so a full user response
// must clear one that was switched to 国际站 elsewhere instead of keeping it.
export function mergeFreshUser(prev, fresh) {
  return {
    ...prev,
    ...fresh,
    codeBuddyInternetEnvironment: fresh?.codeBuddyInternetEnvironment || "",
  };
}

const STEPS = [
  {
    id: "auth",
    title: "Credentials and authorization",
    desc: "GitHub access and model keys",
  },
  {
    id: "project",
    title: "Projects & repositories",
    desc: "Choose or create a project and link a GitHub repository",
  },
  {
    id: "workflow",
    title: "Default roles and SOP",
    desc: "Use the platform’s standard roles and delivery workflow",
  },
  {
    id: "done",
    title: "Done",
    desc: "Save configuration and get started",
  },
];

const FALLBACK_ROLES = [
  {
    id: "loopforge-requirement",
    name: "Clarify requirements",
    description: "Clarify scope and acceptance criteria",
    prompt: "Use the requirement and current repository to define the goal, scope, exclusions, and acceptance criteria. Deliver a structured requirement and implementation plan.\n\nTask input: {{input}}",
    artifactId: "requirement-report",
    artifactPath: "requirement-report.md",
  },
  {
    id: "loopforge-design",
    name: "Design the solution",
    description: "Write a technical design and implementation plan",
    prompt: "Trace affected modules and call paths. Design interfaces, data models, and the smallest viable change. Identify risks and how to verify the result.\n\nTask input: {{input}}",
    artifactId: "tech-design",
    artifactPath: "tech-design.md",
  },
  {
    id: "loopforge-implement",
    name: "Implement changes",
    description: "Implement and test on the working branch",
    prompt: "Implement the agreed design and plan. Run unit tests for affected modules and record the changes.\n\nTask input: {{input}}",
    artifactId: "change-report",
    artifactPath: "change-report.md",
  },
  {
    id: "loopforge-review",
    name: "Independent review",
    description: "Review quality and standards",
    prompt: "Independently review correctness, regression risks, security boundaries, and test evidence. Record your conclusion.\n\nTask input: {{input}}",
    artifactId: "review-report",
    artifactPath: "review-report.md",
  },
  {
    id: "loopforge-test",
    name: "Run tests",
    description: "Run tests and assess acceptance",
    prompt: "Run automated or regression tests against each acceptance criterion and write the test report.\n\nTask input: {{input}}",
    artifactId: "test-report",
    artifactPath: "test-report.md",
  },
  {
    id: "loopforge-mr",
    name: "Open merge request",
    description: "Push the branch and open a merge request",
    prompt: "Push the working branch, create or update its pull request, and summarize the changes.\n\nTask input: {{input}}",
    artifactId: "mr-body",
    artifactPath: "mr-body.md",
  },
  {
    id: "loopforge-summary",
    name: "Delivery summary",
    description: "Collect artifacts and document lessons",
    prompt: "Summarize the changes, validation results, and merge request link. Record lessons the project can reuse.\n\nTask input: {{input}}",
    artifactId: "summary-report",
    artifactPath: "summary-report.md",
  },
];

const FALLBACK_NODES = [
  { id: "requirement", name: "Clarify requirements", type: "agent", agentId: "loopforge-requirement", metricStage: "clarification" },
  { id: "design", name: "Design the solution", type: "agent", agentId: "loopforge-design", metricStage: "development" },
  { id: "implement", name: "Implement changes", type: "agent", agentId: "loopforge-implement", metricStage: "development" },
  { id: "review", name: "Independent review", type: "agent", agentId: "loopforge-review", metricStage: "testing" },
  { id: "test", name: "Run tests", type: "agent", agentId: "loopforge-test", metricStage: "testing" },
  { id: "mr", name: "Open merge request", type: "agent", agentId: "loopforge-mr", metricStage: "development" },
  { id: "summary", name: "Delivery summary", type: "agent", agentId: "loopforge-summary", metricStage: "none" },
];

const BRANCH_OPTIONS = [
  { value: "main", label: "main", hint: "GitHub default branch" },
  { value: "master", label: "master", hint: "Traditional main branch" },
  { value: "preview", label: "preview", hint: "Staging branch" },
  { value: "develop", label: "develop", hint: "Development integration branch" },
];

let closeActiveSelect = null;

/**
 * HarnessSelect: adapted from Harness UI's AppSelect.vue.
 * Supports searchable filtering, custom typed value, keyboard navigation,
 * animated chevron rotation, and a portal dropdown with presence transition.
 */
export function HarnessSelect({
  value,
  options = [],
  onChange,
  placeholder = "Select an option",
  ariaLabel,
  searchable = false,
  searchPlaceholder = "Search options…",
  allowCustom = false,
  disabled = false,
}) {
  const selectId = `qa-select-${useId().replaceAll(":", "")}`;
  const listboxId = `${selectId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: 240,
    maxHeight: 280,
    placement: "bottom",
  });
  const presence = usePanelPresence(open, 160);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);

  const matched = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );
  const selectedLabel = matched
    ? matched.label
    : allowCustom && value
      ? value
      : placeholder;
  const isPlaceholder = !matched && !(allowCustom && value);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered =
      !q || !searchable
        ? options
        : options.filter(
            (opt) =>
              opt.label.toLowerCase().includes(q) ||
              opt.value.toLowerCase().includes(q) ||
              (opt.hint || "").toLowerCase().includes(q),
          );
    const trimmed = query.trim();
    const canCustom =
      allowCustom &&
      searchable &&
      trimmed &&
      !options.some((opt) => opt.value === trimmed);
    const customRow = canCustom
      ? [
          {
            value: trimmed,
            label: `Use “${trimmed}"`,
            hint: "Custom",
            custom: true,
          },
        ]
      : [];
    return [...customRow, ...filtered];
  }, [options, query, searchable, allowCustom]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const place = useCallback(() => {
    const trig = triggerRef.current;
    if (!trig) return;
    const rect = trig.getBoundingClientRect();
    const margin = 8;
    const gap = 6;
    const maxPanelHeight = 280;
    const panelHeight = Math.min(
      panelRef.current?.offsetHeight || maxPanelHeight,
      maxPanelHeight,
    );
    const below = window.innerHeight - rect.bottom - gap - margin;
    const above = rect.top - gap - margin;
    const flipUp = below < panelHeight && above > below;
    const maxHeight = Math.max(
      120,
      Math.min(maxPanelHeight, flipUp ? above : below),
    );
    const visibleHeight = Math.min(panelHeight, maxHeight);
    const top = flipUp
      ? Math.max(margin, rect.top - gap - visibleHeight)
      : Math.min(rect.bottom + gap, window.innerHeight - margin - visibleHeight);
    const width = Math.max(180, rect.width);
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - width - margin),
    );
    setPosition({
      top: Math.round(top),
      left: Math.round(left),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight),
      placement: flipUp ? "top" : "bottom",
    });
  }, []);

  useLayoutEffect(() => {
    if (presence.mounted) place();
  }, [presence.mounted, rows.length, place]);

  useEffect(() => {
    if (!open) return undefined;
    if (closeActiveSelect && closeActiveSelect !== close) closeActiveSelect();
    closeActiveSelect = close;
    const idx = Math.max(
      0,
      options.findIndex((opt) => opt.value === value),
    );
    setActiveIndex(idx);
    const frame = requestAnimationFrame(() => {
      if (searchable) searchRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (closeActiveSelect === close) closeActiveSelect = null;
    };
  }, [open, close, options, searchable, value]);

  useEffect(() => {
    if (!presence.mounted) return undefined;
    const onOutside = (event) => {
      if (
        triggerRef.current?.contains(event.target) ||
        panelRef.current?.contains(event.target)
      )
        return;
      close();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onOutside, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onOutside, true);
    };
  }, [presence.mounted, place, close]);

  function choose(nextValue) {
    if (disabled) return;
    onChange?.(nextValue);
    close();
    triggerRef.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event) {
    if (disabled || event.isComposing) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus({ preventScroll: true });
      return;
    }
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (rows.length) setActiveIndex((i) => (i + 1) % rows.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (rows.length)
        setActiveIndex((i) => (i - 1 + rows.length) % rows.length);
      return;
    }
    if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault();
      const target = rows[activeIndex];
      if (target) choose(target.value);
    }
  }

  return (
    <div className="qa-select-root">
      <button
        ref={triggerRef}
        type="button"
        className={`qa-select-trigger ${open ? "is-open" : ""}`}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span
          className={`qa-select-value ${isPlaceholder ? "is-placeholder" : ""}`}
        >
          {selectedLabel}
        </span>
        {matched?.hint ? (
          <span className="qa-select-trigger-hint">{matched.hint}</span>
        ) : null}
        <HarnessIcon
          name="chevron-down"
          size={14}
          interactive={false}
          className={`qa-select-chevron ${open ? "is-open" : ""}`}
        />
      </button>

      {presence.mounted
        ? createPortal(
            <div
              ref={panelRef}
              className="qa-select-panel"
              data-phase={presence.phase}
              data-placement={position.placement}
              style={{
                top: position.top,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
              onKeyDown={onKeyDown}
            >
              {searchable ? (
                <label className="qa-select-search">
                  <HarnessIcon name="search" size={14} interactive={false} />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveIndex(0);
                    }}
                  />
                </label>
              ) : null}
              <div
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel}
                className="qa-select-options"
              >
                {rows.length ? (
                  rows.map((row, index) => {
                    const selected = row.value === value;
                    const active = index === activeIndex;
                    return (
                      <button
                        key={(row.custom ? "custom:" : "opt:") + row.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={[
                          "qa-select-option",
                          selected && "is-selected",
                          active && "is-active",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(row.value)}
                      >
                        <span className="qa-select-option-label">
                          {row.label}
                        </span>
                        {row.hint ? (
                          <span className="qa-select-option-hint">
                            {row.hint}
                          </span>
                        ) : null}
                        {selected ? (
                          <HarnessIcon
                            name="check"
                            size={14}
                            interactive={false}
                            className="qa-select-option-check"
                          />
                        ) : null}
                      </button>
                    );
                  })
                ) : (
                  <p className="qa-select-empty">No matching options</p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/**
 * HarnessSwitch: adapted from Harness UI's AppSwitch.vue.
 */
export function HarnessSwitch({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`qa-switch ${checked ? "is-on" : ""}`}
      onClick={() => !disabled && onChange?.(!checked)}
    >
      <span className="qa-switch-thumb" aria-hidden="true" />
    </button>
  );
}

/** Pill whose dot pops once each time `ok` flips; alternating keyframe names restart it. */
function StatusPill({ ok, okLabel = "Ready", needLabel = "Setup required" }) {
  const previous = useRef(ok);
  const [pops, setPops] = useState(0);
  useEffect(() => {
    if (previous.current === ok) return;
    previous.current = ok;
    setPops((n) => n + 1);
  }, [ok]);
  return (
    <span
      className={`qa-status-pill ${ok ? "is-ok" : "is-need"}`}
      data-pop={pops ? (pops % 2 ? "a" : "b") : undefined}
    >
      {ok ? okLabel : needLabel}
    </span>
  );
}

function VerifyMessage({ result, okText }) {
  const text = result.valid
    ? okText
    : result.error || `Missing permissions: ${(result.missing || []).join(", ")}`;
  return (
    <p
      key={text}
      className={`qa-verify-msg qa-msg-in ${result.valid ? "is-ok" : "is-err"}`}
    >
      <HarnessIcon
        name={result.valid ? "check" : "info"}
        size={13}
        interactive={false}
      />
      <span>{text}</span>
    </p>
  );
}

/** Both labels share one grid cell so the button keeps its widest width while busy. */
function BusyLabel({ busy, busyLabel, children }) {
  return (
    <span className="qa-btn-label">
      <span className="qa-btn-label-cell" aria-hidden={busy || undefined}>
        {children}
      </span>
      <span className="qa-btn-label-cell" aria-hidden={!busy || undefined}>
        <HarnessIcon
          name="arc-spinner"
          size={14}
          motion={busy ? "busy" : "idle"}
          interactive={false}
        />
        {busyLabel}
      </span>
    </span>
  );
}

function parseGitHubRepo(raw) {
  let value = String(raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^git\s+clone\s+/i, "")
    .replace(/^github:/i, "https://github.com/")
    .replace(/^(?:git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)/i, "https://github.com/");
  if (/^github\.com\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol)
  )
    return null;
  const [owner = "", rawName = ""] = url.pathname.split("/").filter(Boolean);
  const name = rawName.replace(/\.git$/i, "");
  const valid = (seg) =>
    /^[A-Za-z0-9_.-]+$/.test(seg) && seg !== "." && seg !== "..";
  if (!valid(owner) || !valid(name)) return null;
  return {
    project: `github:${owner}/${name}`,
    provider: "github",
    name,
    webUrl: `https://github.com/${owner}/${name}`,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
  };
}

// SSH preview first (it leaves github.com to the GitHub parser, matching the
// server); self-hosted legacy repositories keep the git.example.com form.
export function parseGongfengRepo(raw) {
  const httpsInfo = globalThis.LoopForgeGitHTTPS(raw);
  if (httpsInfo) return httpsInfo;
  const sshInfo = globalThis.LoopForgeGitSSH(raw);
  if (sshInfo) return sshInfo;
  const github = parseGitHubRepo(raw);
  if (github) return github;
  const original = String(raw || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  if (!original) return null;
  const strippedClone = /^git\s+clone\s+/i.test(original);
  let value = original
    .replace(/^git\s+clone\s+/i, "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
  if (strippedClone && /\s/.test(value)) value = value.split(/\s+/)[0];
  if (!value || /[\s"'<>()\\]/.test(value)) return null;
  const ssh = /^(git@|ssh:\/\/)/i.test(value);
  value = value.replace(/\/+$/, "");
  const hadScheme = value.includes("://");
  const hadAt = value.includes("@");
  let rest = value;
  if (hadScheme) rest = rest.slice(rest.indexOf("://") + 3);
  if (rest.includes("@")) rest = rest.slice(rest.lastIndexOf("@") + 1);
  let path = "";
  if (!hadScheme && !hadAt && !rest.includes(":")) {
    path = rest;
  } else if (rest.includes("/")) {
    const cut = rest.search(/[:/]/);
    const host = rest.slice(0, cut);
    if (host.toLowerCase() !== "git.example.com") return null;
    path = rest.slice(cut + 1);
    if (rest[cut] === ":") {
      const slash = path.indexOf("/");
      if (slash >= 0 && /^\d+$/.test(path.slice(0, slash)))
        path = path.slice(slash + 1);
    }
  } else {
    return null;
  }
  path = path.replace(/^git\.example\.com\//i, "").replace(/\.git$/i, "");
  for (const marker of [
    "/-/",
    "/tree/",
    "/blob/",
    "/commit/",
    "/commits/",
    "/merge_requests/",
    "/issues/",
    "/snippets/",
    "/wikis/",
    "/releases/",
    "/tags/",
  ]) {
    const index = path.indexOf(marker);
    if (index >= 0) path = path.slice(0, index);
  }
  path = path.replace(/^\/+|\/+$/g, "");
  const parts = path.split("/");
  if (
    parts.length < 2 ||
    path.includes("..") ||
    parts.some((seg) => !seg || /[\s\\?#]/.test(seg))
  )
    return null;
  const name = parts[parts.length - 1];
  return {
    project: path,
    provider: "gongfeng",
    name,
    webUrl: `https://git.example.com/${path}`,
    cloneUrl: ssh
      ? `git@git.example.com:${path}.git`
      : `https://git.example.com/${path}.git`,
  };
}

function slugifyProjectId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function deriveProjectKey(value) {
  const clean = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 8);
  return clean || "PROJ";
}

async function provisionFallbackProjectSOP(projectId, workflowId, owner) {
  const sandboxId = `local-${projectId}`.slice(0, 60);
  await write(
    "/api/sandboxes",
    {
      id: sandboxId,
      name: "Local development sandbox",
      projectId,
      driver: "local",
      shared: false,
    },
    "PUT",
  );

  const agentIdMap = {};
  for (const role of FALLBACK_ROLES) {
    const agentId = `${role.id}-${projectId}`.slice(0, 60);
    agentIdMap[role.id] = agentId;
    await write(
      "/api/agents",
      {
        id: agentId,
        name: role.name,
        projectId,
        version: 1,
        executorId: "codebuddy",
        description: role.description,
        prompt: role.prompt,
        artifactOutputs: [
          {
            name: role.artifactId,
            path: role.artifactPath,
            mediaType: "text/markdown",
            required: true,
          },
        ],
      },
      "PUT",
    );
  }

  const nodes = FALLBACK_NODES.map((node, index) => ({
    id: node.id,
    name: node.name,
    type: "agent",
    agentId: agentIdMap[node.agentId] || node.agentId,
    metricStage: node.metricStage || "development",
    maxAttempts: 1,
    maxReworks: 1,
    position: { x: 80 + index * 220, y: 200 },
    artifactOutputs: [
      {
        name: `${node.id}-report`,
        path: `${node.id}-report.md`,
        mediaType: "text/markdown",
        required: true,
      },
    ],
  }));

  const edges = nodes.slice(1).map((node, index) => ({
    id: `e-${nodes[index].id}-${node.id}`,
    source: nodes[index].id,
    target: node.id,
    when: "success",
  }));

  const draft = await write(
    "/api/workflows",
    {
      id: workflowId,
      name: "Backend delivery SOP",
      projectId,
      owner,
      status: "draft",
      version: 1,
      revision: 0,
      sopLane: "backend",
      sandboxProfileId: sandboxId,
      tags: ["Quick setup", `generic-source:${DEFAULT_SOP_ID}`],
      description:
        "Standard delivery workflow from requirement finalization, solution design, code implementation, independent review, and test verification to initiating an MR.",
      nodes,
      edges,
    },
    "PUT",
  );
  return write(
    `/api/workflows/${encodeURIComponent(draft.id)}/publish`,
    {},
  ).catch(() => draft);
}

export default function QuickAccessWizard({
  open,
  user,
  projects = [],
  projectId = "",
  sponsoredModel = "",
  sponsoredModels = [],
  onClose,
  onCompleted,
  onCredentialsSaved,
  onOpenView,
}) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState("wizard");
  const [storedUser, setStoredUser] = useState(user);
  const [sshCredentials, setSSHCredentials] = useState({ userId: null, keys: null, error: false });
  const [catalogProjects, setCatalogProjects] = useState(projects);
  const [repositories, setRepositories] = useState([]);
  const [workflows, setWorkflows] = useState([]);
  const [projectAgents, setProjectAgents] = useState([]);
  const [templateAgents, setTemplateAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [codeBuddyApiKey, setCodeBuddyApiKey] = useState("");
  // null follows the saved setting until the user picks an environment here.
  const [codeBuddyEnvChoice, setCodeBuddyEnvChoice] = useState(null);
  const [verifyingGit, setVerifyingGit] = useState(false);
  const [gitVerify, setGitVerify] = useState(null);
  const [projectMode, setProjectMode] = useState("existing");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [newProjectKey, setNewProjectKey] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [repoBranch, setRepoBranch] = useState("main");
  const [bindRepoNow, setBindRepoNow] = useState(true);
  const [makeDefaultRepo, setMakeDefaultRepo] = useState(true);
  const [selectedWorkflowId, setSelectedWorkflowId] =
    useState(DEFAULT_SOP_ID);
  const [previewTab, setPreviewTab] = useState("stages");
  const [completedSummary, setCompletedSummary] = useState(null);
  const [direction, setDirection] = useState("forward");
  const [stepAnimated, setStepAnimated] = useState(false);
  const headingRef = useRef(null);
  const bodyRef = useRef(null);
  const presence = usePanelPresence(open, 300);
  const reopenedWhileClosing = presence.phase === "closing";

  const editableProjects = useMemo(
    () =>
      (catalogProjects || []).filter((project) =>
        canChatInProject(project, storedUser || user),
      ),
    [catalogProjects, storedUser, user],
  );

  const projectSelectOptions = useMemo(
    () =>
      editableProjects.map((project) => ({
        value: project.id,
        label: project.name,
        hint: project.key || project.id,
      })),
    [editableProjects],
  );

  const genericWorkflows = useMemo(() => {
    const rows = (workflows || []).filter((workflow) => workflow.generic);
    return rows.length
      ? rows
      : [
          {
            id: DEFAULT_SOP_ID,
            name: "Backend delivery SOP",
            description:
              "Standard delivery chain from requirement finalization, solution design, code implementation, independent review, and test verification to initiating an MR.",
            generic: true,
            nodes: FALLBACK_NODES,
          },
        ];
  }, [workflows]);

  const currentProject = useMemo(
    () =>
      editableProjects.find((project) => project.id === selectedProjectId) ||
      editableProjects[0] ||
      null,
    [editableProjects, selectedProjectId],
  );

  // A member can work in a shared project (e.g. the welcome project) without
  // owning it; binding a repository there would only fail at the last step.
  const repoBindBlocked =
    projectMode === "existing" &&
    Boolean(currentProject) &&
    !canManageProjectRepos(currentProject, storedUser || user);

  const projectRepos = useMemo(
    () =>
      currentProject
        ? (repositories || []).filter(
            (repo) => repo.projectId === currentProject.id,
          )
        : [],
    [currentProject, repositories],
  );

  const defaultRepo = useMemo(() => {
    if (!currentProject) return null;
    return (
      projectRepos.find(
        (repo) => repo.id === currentProject.defaultRepositoryId,
      ) ||
      projectRepos[0] ||
      null
    );
  }, [currentProject, projectRepos]);

  const availableWorkflows = useMemo(() => {
    const projectIdTarget =
      projectMode === "existing" ? currentProject?.id : "";
    const ownedOrShared = (workflows || []).filter(
      (workflow) =>
        !workflow.generic &&
        ((projectIdTarget && workflow.projectId === projectIdTarget) ||
          workflow.shared),
    );
    const seen = new Set(ownedOrShared.map((item) => item.id));
    const merged = [...ownedOrShared];
    for (const generic of genericWorkflows) {
      if (!seen.has(generic.id)) merged.push(generic);
    }
    return merged;
  }, [workflows, genericWorkflows, projectMode, currentProject]);

  const sopSelectOptions = useMemo(
    () =>
      availableWorkflows.map((workflow) => {
        const stageCount = (workflow.nodes || FALLBACK_NODES).filter(
          (n) => n.type === "agent",
        ).length;
        const scopeLabel = workflow.generic
          ? "Platform default template"
          : projectMode === "existing" &&
              workflow.projectId === currentProject?.id
            ? "Existing project SOP (reuse directly)"
            : "Shared SOP";
        return {
          value: workflow.id,
          label: workflow.name,
          hint: `${stageCount} stages · ${scopeLabel}`,
        };
      }),
    [availableWorkflows, currentProject, projectMode],
  );

  const activeWorkflow = useMemo(
    () =>
      availableWorkflows.find(
        (workflow) => workflow.id === selectedWorkflowId,
      ) || availableWorkflows[0],
    [availableWorkflows, selectedWorkflowId],
  );

  const parsedRepo = useMemo(() => parseGongfengRepo(repoUrl), [repoUrl]);

  // Reopening during the exit transition reverses it onto the same content.
  useEffect(() => {
    if (!open || reopenedWhileClosing) return;
    setStep(0);
    setDirection("forward");
    setStepAnimated(false);
    setPhase("wizard");
    setError("");
    setGitToken("");
    setCodeBuddyApiKey("");
    setCodeBuddyEnvChoice(null);
    setGitVerify(null);
    setCompletedSummary(null);
    setBindRepoNow(true);
    setPreviewTab("stages");
    setIdTouched(false);
    setKeyTouched(false);
  }, [open]);

  const verifyStoredGitToken = useCallback(
    async (uid = user?.id) => {
      if (!uid) return null;
      setVerifyingGit(true);
      try {
        const result = await api(
          `/api/users/${encodeURIComponent(uid)}/git-token/verify`,
        );
        setGitVerify(result);
        return result;
      } catch (err) {
        const fallback = { valid: false, error: err.message };
        setGitVerify(fallback);
        return fallback;
      } finally {
        setVerifyingGit(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [usersRes, projectsRes, reposRes, workflowsRes, agentsRes] =
          await Promise.all([
            api("/api/users").catch(() => []),
            api("/api/projects").catch(() => projects),
            api("/api/repositories").catch(() => []),
            api("/api/workflows").catch(() => []),
            api("/api/agents").catch(() => []),
          ]);
        if (!active) return;
        const freshUser =
          (usersRes || []).find(
            (item) => Number(item.id) === Number(user?.id),
          ) || user;
        setStoredUser(mergeFreshUser(user, freshUser));
        if (freshUser?.gitHubCredentialConfigured && freshUser?.id) {
          void verifyStoredGitToken(freshUser.id);
        }
        const nextProjects = Array.isArray(projectsRes)
          ? projectsRes
          : projects;
        setCatalogProjects(nextProjects);
        setRepositories(Array.isArray(reposRes) ? reposRes : []);
        const nextWorkflows = Array.isArray(workflowsRes) ? workflowsRes : [];
        setWorkflows(nextWorkflows);
        setProjectAgents(Array.isArray(agentsRes) ? agentsRes : []);
        const mine = nextProjects.filter((project) =>
          canChatInProject(project, freshUser),
        );
        const preferred =
          mine.find((project) => project.id === projectId) || mine[0] || null;
        if (preferred) {
          setProjectMode("existing");
          setSelectedProjectId(preferred.id);
          const ownedSop = nextWorkflows.find(
            (w) =>
              !w.generic &&
              w.projectId === preferred.id &&
              (w.id === preferred.workflowId || w.status === "published"),
          );
          if (ownedSop) setSelectedWorkflowId(ownedSop.id);
          else if (preferred.workflowId)
            setSelectedWorkflowId(preferred.workflowId);
        } else {
          setProjectMode("create");
          const login = freshUser?.loginName || "team";
          const suggestedName = `${freshUser?.chineseName || login} projects`;
          setNewProjectName(suggestedName);
          setNewProjectId(slugifyProjectId(`${login}-project`) || "my-project");
          setNewProjectKey(deriveProjectKey(login));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [open, projectId, projects, user]);

  useEffect(() => {
    if (!open || !user?.id || user.isGuest) return undefined;
    let active = true;
    let generation = 0;
    const refresh = () => {
      const version = ++generation;
      api(`/api/users/${encodeURIComponent(user.id)}/git-ssh-keys`)
        .then((keys) => {
          if (active && version === generation) setSSHCredentials({ userId: user.id, keys: Array.isArray(keys) ? keys : [], error: false });
        })
        .catch(() => {
          if (active && version === generation) setSSHCredentials({ userId: user.id, keys: [], error: true });
        });
    };
    const credentialsChanged = (event) => {
      if (event.origin === location.origin && event.source === window.parent && event.data?.type === "agentflow-credentials-changed") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("message", credentialsChanged);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("message", credentialsChanged);
    };
  }, [open, user?.id, user?.isGuest]);

  useEffect(() => {
    if (!open || !selectedWorkflowId) return undefined;
    // Only platform templates have template roles; a project SOP would 404.
    const known = (workflows || []).find((w) => w.id === selectedWorkflowId);
    if (known && !known.generic) {
      setTemplateAgents([]);
      return undefined;
    }
    let active = true;
    api(`/api/workflows/${encodeURIComponent(selectedWorkflowId)}/agents`)
      .then((rows) => {
        if (active && Array.isArray(rows) && rows.length)
          setTemplateAgents(rows);
      })
      .catch(() => {
        if (active) setTemplateAgents([]);
      });
    return () => {
      active = false;
    };
  }, [open, selectedWorkflowId, workflows]);

  useEffect(() => {
    if (!open) return;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [open, step, phase]);

  useEffect(() => {
    if (!open) return undefined;
    const refreshUser = () => {
      api("/api/users")
        .then((usersRes) => {
          const fresh = (usersRes || []).find(
            (item) => Number(item.id) === Number(user?.id),
          );
          if (fresh) {
            setStoredUser((prev) => mergeFreshUser(prev, fresh));
            if (fresh.gitHubCredentialConfigured) {
              void verifyStoredGitToken(fresh.id);
            }
          }
        })
        .catch(() => {});
    };
    window.addEventListener("focus", refreshUser);
    const credentialsChanged = (event) => {
      if (event.origin === location.origin && event.source === window.parent && event.data?.type === "agentflow-credentials-changed") refreshUser();
    };
    window.addEventListener("message", credentialsChanged);
    return () => {
      window.removeEventListener("focus", refreshUser);
      window.removeEventListener("message", credentialsChanged);
    };
  }, [open, user?.id, verifyStoredGitToken]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !saving && !closeActiveSelect) onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  useEffect(() => {
    if (projectMode !== "create" || !parsedRepo) return;
    if (!newProjectName.trim()) setNewProjectName(parsedRepo.name);
    if (!idTouched)
      setNewProjectId(slugifyProjectId(parsedRepo.name) || "my-project");
    if (!keyTouched) setNewProjectKey(deriveProjectKey(parsedRepo.name));
  }, [parsedRepo, projectMode, newProjectName, idTouched, keyTouched]);

  useEffect(() => {
    if (!open || projectMode !== "existing" || !currentProject) return;
    const ownedSop = (workflows || []).find(
      (w) =>
        !w.generic &&
        w.projectId === currentProject.id &&
        (w.id === currentProject.workflowId || w.status === "published"),
    );
    if (ownedSop) setSelectedWorkflowId(ownedSop.id);
    else if (currentProject.workflowId)
      setSelectedWorkflowId(currentProject.workflowId);
    else setSelectedWorkflowId(DEFAULT_SOP_ID);
  }, [open, projectMode, currentProject?.id]);

  // A new project starts from the platform template; the SOP picked for the
  // previously selected project belongs to that project and is not offered.
  useEffect(() => {
    if (open && projectMode === "create") setSelectedWorkflowId(DEFAULT_SOP_ID);
  }, [open, projectMode]);

  const roles = useMemo(() => {
    if (activeWorkflow && !activeWorkflow.generic) {
      const boundIds = new Set(
        (activeWorkflow.nodes || []).map((n) => n.agentId).filter(Boolean),
      );
      const matched = (projectAgents || []).filter(
        (a) =>
          boundIds.has(a.id) ||
          a.projectId === (activeWorkflow.projectId || currentProject?.id),
      );
      if (matched.length) return matched;
    }
    return templateAgents.length ? templateAgents : FALLBACK_ROLES;
  }, [activeWorkflow, projectAgents, currentProject?.id, templateAgents]);

  if (!presence.mounted) return null;

  const closing = presence.phase === "closing";
  const activeStepIndex = phase === "success" ? STEPS.length - 1 : step;
  const activeStep = STEPS[activeStepIndex] || STEPS[0];
  const wizardStepCount = STEPS.length - 1;
  const gitReady = Boolean(storedUser?.gitHubCredentialConfigured || gitToken.trim());
  const hasSSHKeys = Boolean(storedUser?.gitSshKeyConfigured);
  const selectedSSHRepo = parsedRepo || parseGongfengRepo(defaultRepo?.cloneUrl);
  const sshKeysLoaded = sshCredentials.userId === user?.id && sshCredentials.keys !== null;
  const hasSSHKey = (remote) => sshKeysLoaded && !sshCredentials.error && sshCredentials.keys.some(
    (key) => globalThis.LoopForgeGitSSHHost(key.host) === remote?.host,
  );
  const sshReady = hasSSHKey(selectedSSHRepo);
  const sshRepository = (parsedRepo || defaultRepo)?.provider === "ssh";
  const codeBuddyReady = Boolean(
    storedUser?.codeBuddyApiKeyConfigured || codeBuddyApiKey.trim(),
  );
  // The CLI gets the stored text as-is: an old value such as china preselects
  // what it meant, and still differs from it, so 下一步 rewrites it.
  const storedCodeBuddyEnvRaw = String(
    storedUser?.codeBuddyInternetEnvironment || "",
  ).trim();
  const storedCodeBuddyEnv =
    codeBuddyEnvironmentIntent(storedCodeBuddyEnvRaw)?.value ?? "";
  const codeBuddyEnvLegacy = codeBuddyEnvironmentLegacy(storedCodeBuddyEnvRaw);
  const codeBuddyEnv = codeBuddyEnvChoice ?? storedCodeBuddyEnv;
  const codeBuddyEnvInfo =
    codeBuddyEnvironment(codeBuddyEnv) || CODEBUDDY_ENVIRONMENTS[0];
  const codeBuddyWarning = codeBuddyKeyWarning(codeBuddyApiKey);
  const nodes =
    activeWorkflow?.nodes?.filter((node) => node.type === "agent") ||
    FALLBACK_NODES;

  function goToStep(next) {
    setDirection(next < step ? "back" : "forward");
    setStepAnimated(true);
    setStep(next);
  }

  async function saveTypedCredentials() {
    if (!user?.id) return storedUser;
    const payload = {};
    let savedGit = false;
    if (gitToken.trim()) {
      const endpoint = `/api/users/${encodeURIComponent(user.id)}/git-http-credentials`;
      const credentials = await api(endpoint);
      const existing = credentials.find(credential => credential.host === "github.com");
      await write(endpoint, { ...(existing ? {id:existing.id} : {}), host:"github.com", platform:"github", name:"GitHub", username:"x-access-token", token:gitToken.trim() }, "PUT");
      savedGit = true;
    }
    if (codeBuddyApiKey.trim())
      payload.codeBuddyApiKey = codeBuddyApiKey.trim();
    // A key is always saved with the environment it was issued for.
    if (codeBuddyApiKey.trim() || codeBuddyEnv !== storedCodeBuddyEnvRaw)
      payload.codeBuddyInternetEnvironment = codeBuddyEnv;
    if (!Object.keys(payload).length && !savedGit) return storedUser;
    const saved = await write(
      `/api/users/${encodeURIComponent(user.id)}/credentials`,
      payload,
      "PUT",
    );
    const merged = { ...storedUser, ...saved };
    // The server omits an empty environment, so 国际站 must overwrite the old value here.
    if ("codeBuddyInternetEnvironment" in payload)
      merged.codeBuddyInternetEnvironment =
        saved?.codeBuddyInternetEnvironment || "";
    setStoredUser(merged);
    setGitToken("");
    setCodeBuddyApiKey("");
    setCodeBuddyEnvChoice(null);
    void onCredentialsSaved?.();
    window.parent !== window &&
      window.parent.postMessage(
        { type: "agentflow-credentials-changed" },
        location.origin,
      );
    return merged;
  }

  async function verifyGit() {
    if (!user?.id || verifyingGit) return;
    setVerifyingGit(true);
    setGitVerify(null);
    setError("");
    try {
      const typed = gitToken.trim();
      const result = typed
        ? await write(
            `/api/users/${encodeURIComponent(user.id)}/git-token/verify`,
            { token: typed },
          )
        : await api(
            `/api/users/${encodeURIComponent(user.id)}/git-token/verify`,
          );
      setGitVerify(result);
      if (result?.valid && typed) await saveTypedCredentials();
    } catch (err) {
      setGitVerify({ valid: false, error: err.message });
    } finally {
      setVerifyingGit(false);
    }
  }

  async function nextStep() {
    if (saving) return;
    setError("");
    if (activeStep.id === "auth") {
      if (!gitReady && !hasSSHKeys && !codeBuddyReady && !sponsoredModel) {
        setError("Please configure a GitHub Git Token, Git SSH key, or CodeBuddy API Key first.");
        return;
      }
      setSaving(true);
      try {
        await saveTypedCredentials();
        goToStep(1);
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (activeStep.id === "project") {
      if (projectMode === "create") {
        const id = slugifyProjectId(newProjectId || newProjectName);
        if (!id || !newProjectName.trim()) {
          setError("Please enter the project name and project identifier.");
          return;
        }
        // Saving a project with an existing id replaces it (members, TAPD
        // settings), so "new project" must never land on an existing one.
        if (catalogProjects.some((item) => item.id === id)) {
          setError(
            `Project ID "${id}" is already in use by an existing project. Please use a different identifier, or switch to "Select existing project".`,
          );
          return;
        }
      } else if (!currentProject) {
        setError("Please select a project, or switch to creating a new project.");
        return;
      }
      if (bindRepoNow && repoUrl.trim() && repoBindBlocked) {
        setError(
          `You cannot bind a repository to “${currentProject?.name || "this project"}”. Create your own project or turn off “Bind repository” to continue.`,
        );
        return;
      }
      if (bindRepoNow && repoUrl.trim() && !parsedRepo) {
        setError(
          "Please enter a Git HTTPS repository link or Git SSH clone address.",
        );
        return;
      }
      goToStep(2);
      return;
    }
    if (activeStep.id === "workflow") {
      await finishSetup();
    }
  }

  async function finishSetup() {
    setSaving(true);
    setError("");
    try {
      const latestUser = await saveTypedCredentials();
      let targetProject = currentProject;
      // Save the SOP the page shows; a stale id hidden by the current
      // filter must never be bound to the project.
      const sopId = activeWorkflow?.id || DEFAULT_SOP_ID;
      if (projectMode === "create") {
        const id = slugifyProjectId(newProjectId || newProjectName);
        const key = deriveProjectKey(newProjectKey || id);
        if (catalogProjects.some((item) => item.id === id))
          throw new Error(
            `Project ID "${id}" is already in use by an existing project. Please use a different identifier.`,
          );
        targetProject = await write(
          "/api/projects",
          {
            id,
            key,
            name: newProjectName.trim(),
            description: "",
            color: "#536dfe",
            ownerId: Number(user?.id) || 0,
            workflowId: sopId,
            members: [],
          },
          "POST",
        );
      } else if (
        targetProject &&
        targetProject.workflowId !== sopId &&
        Number(targetProject.ownerId) === Number(user?.id)
      ) {
        targetProject = await write(
          "/api/projects",
          { ...targetProject, workflowId: sopId },
          "PUT",
        );
      }

      let boundRepo = defaultRepo;
      if (bindRepoNow && parsedRepo && targetProject?.id && !repoBindBlocked) {
        const existingRepo = (repositories || []).find(
          (repo) =>
            repo.projectId === targetProject.id &&
            (["ssh", "https"].includes(parsedRepo.provider)
              ? repo.cloneUrl === parsedRepo.cloneUrl
              : repo.gongfengProjectId === parsedRepo.project ||
                repo.webUrl === parsedRepo.webUrl),
        );
        if (existingRepo) {
          boundRepo = await write(
            "/api/repositories",
            {
              ...existingRepo,
              provider: parsedRepo.provider,
              name: parsedRepo.name,
              gongfengProjectId: parsedRepo.project,
              webUrl: parsedRepo.webUrl || existingRepo.webUrl,
              cloneUrl: parsedRepo.cloneUrl,
              defaultBranch: repoBranch.trim() || "main",
              repoUrl: repoUrl.trim(),
            },
            "PUT",
          );
        } else {
          boundRepo = await write("/api/repositories", {
            projectId: targetProject.id,
            provider: parsedRepo.provider || "gongfeng",
            name: parsedRepo.name,
            gongfengProjectId: parsedRepo.project,
            webUrl: parsedRepo.webUrl,
            cloneUrl: parsedRepo.cloneUrl,
            defaultBranch: repoBranch.trim() || "main",
            repoUrl: repoUrl.trim(),
          });
        }
      }

      let provisionedWorkflow = activeWorkflow;
      if (targetProject?.id) {
        const selectedConcrete = (workflows || []).find(
          (item) => item.id === sopId && !item.generic,
        );
        const existingProjectSop =
          selectedConcrete ||
          (workflows || []).find(
            (item) =>
              !item.generic &&
              item.projectId === targetProject.id &&
              ((item.tags || []).includes(`generic-source:${sopId}`) ||
                item.id === `${sopId}-${targetProject.id}` ||
                item.name === (activeWorkflow?.name || "Backend delivery SOP")),
          );
        if (existingProjectSop) {
          provisionedWorkflow = existingProjectSop;
        } else {
          const hasStoredGeneric = (workflows || []).some(
            (item) => item.id === sopId && item.generic,
          );
          const cloneId = `${sopId}-${targetProject.id}`.slice(0, 60);
          const ownerName =
            user?.chineseName || user?.loginName || "Platform";
          if (hasStoredGeneric) {
            try {
              const cloned = await write(
                `/api/workflows/${encodeURIComponent(sopId)}/clone`,
                {
                  id: cloneId,
                  name: (activeWorkflow?.name || "Backend delivery SOP").replace(
                    /^通用/,
                    "",
                  ),
                  owner: ownerName,
                  projectId: targetProject.id,
                },
              );
              provisionedWorkflow = await write(
                `/api/workflows/${encodeURIComponent(cloned.id)}/publish`,
                {},
              ).catch(() => cloned);
            } catch {
              provisionedWorkflow = await provisionFallbackProjectSOP(
                targetProject.id,
                cloneId,
                ownerName,
              );
            }
          } else {
            provisionedWorkflow = await provisionFallbackProjectSOP(
              targetProject.id,
              cloneId,
              ownerName,
            );
          }
        }

        if (
          Number(targetProject.ownerId) === Number(user?.id) &&
          (boundRepo?.id || provisionedWorkflow?.id)
        ) {
          const nextDefaultRepoId =
            boundRepo?.id &&
            (projectMode === "create" ||
              !targetProject.defaultRepositoryId ||
              makeDefaultRepo)
              ? boundRepo.id
              : targetProject.defaultRepositoryId || "";
          targetProject = await write(
            "/api/projects",
            {
              ...targetProject,
              workflowId:
                provisionedWorkflow?.id || targetProject.workflowId || sopId,
              defaultRepositoryId: nextDefaultRepoId,
            },
            "PUT",
          );
        }
      }

      window.parent !== window &&
        window.parent.postMessage(
          {
            type: "agentflow-quick-access-completed",
            projectId: targetProject?.id || "",
          },
          location.origin,
        );

      setCompletedSummary({
        project: targetProject,
        repository: boundRepo,
        workflow: provisionedWorkflow || activeWorkflow,
        rolesCount: roles.length,
        gitReady: Boolean(boundRepo?.provider === "ssh" ? hasSSHKey(parseGongfengRepo(boundRepo.cloneUrl)) : latestUser?.gitHubCredentialConfigured),
        codeBuddyReady: Boolean(
          latestUser?.codeBuddyApiKeyConfigured ||
            storedUser?.codeBuddyApiKeyConfigured,
        ),
      });
      setPhase("success");
      await onCompleted?.(targetProject?.id || "");
    } catch (err) {
      setError(err.message || "Failed to save quick access configuration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="qa-backdrop"
      role="presentation"
      data-phase={presence.phase}
      inert={closing}
      aria-hidden={closing || undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving && !closing)
          onClose?.();
      }}
    >
      <div
        className="qa-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qa-wizard-title"
      >
        <aside className="qa-rail" aria-label="Quick access steps">
          <div className="qa-rail-head">
            <div className="qa-brand-mark">
              <HarnessIcon name="sparkles" size={20} />
            </div>
            <h2 id="qa-wizard-title">Quick setup</h2>
            <p>Provide minimal authentication and repository, using default roles and SOP directly.</p>
          </div>
          <ol className="qa-steps">
            {STEPS.map((item, index) => {
              const done = index < activeStepIndex;
              const current = index === activeStepIndex;
              return (
                <li
                  key={item.id}
                  className={[
                    "qa-step",
                    done && "is-done",
                    current && "is-active",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-current={current ? "step" : undefined}
                >
                  <div className="qa-step-mark">
                    <span
                      className="qa-step-no"
                      aria-hidden={done || undefined}
                    >
                      {item.id === "done" ? (
                        <HarnessIcon name="flag" size={13} interactive={false} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="qa-step-check" aria-hidden="true">
                      <HarnessIcon name="check" size={13} interactive={false} />
                    </span>
                  </div>
                  <div className="qa-step-copy">
                    <div className="qa-step-title">{item.title}</div>
                    <div className="qa-step-desc">{item.desc}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="qa-rail-foot">All configurations can be modified later in personal and project settings.</p>
        </aside>

        <div className="qa-main">
          <button
            type="button"
            className="qa-close"
            aria-label="Disable Quick Onboarding"
            disabled={saving}
            onClick={onClose}
          >
            <HarnessIcon name="close" size={16} />
          </button>

          {phase === "success" ? (
            <>
              <div ref={bodyRef} className="qa-body">
                <div className="qa-success">
                  <div className="qa-success-head">
                    <div className="qa-success-mark" aria-hidden="true">
                      <svg viewBox="0 0 48 48" width="52" height="52">
                        <circle
                          className="qa-success-ring"
                          cx="24"
                          cy="24"
                          r="22"
                          pathLength="1"
                        />
                        <path
                          className="qa-success-tick"
                          d="M15 24.5l6 6 12-13"
                          pathLength="1"
                        />
                      </svg>
                    </div>
                    <h3
                      ref={headingRef}
                      tabIndex={-1}
                      className="qa-title qa-success-item"
                      style={{ "--i": 0 }}
                    >
                      Quick Onboarding completed
                    </h3>
                    <p className="qa-lede qa-success-item" style={{ "--i": 1 }}>
                      Default role and “
                      {completedSummary?.workflow?.name || "Backend delivery SOP"}
                      ” are linked. You can now chat in the workspace or dispatch requirements.
                    </p>
                  </div>

                  <div className="qa-success-grid">
                    <section
                      className="qa-card qa-success-item"
                      style={{ "--i": 2 }}
                    >
                      <div className="qa-card-title">Default Role and Workflow</div>
                      <ul className="qa-role-list">
                        {roles.slice(0, 6).map((role) => (
                          <li key={role.id}>
                            <span className="qa-avatar">
                              {(role.name || "Role").slice(0, 1)}
                            </span>
                            <span>{role.name}</span>
                            <small>Default Role</small>
                          </li>
                        ))}
                        <li>
                          <span className="qa-avatar is-flow">
                            <HarnessIcon name="workflow" size={13} />
                          </span>
                          <span>
                            {completedSummary?.workflow?.name ||
                              "Backend delivery SOP"}
                          </span>
                          <small>Linked</small>
                        </li>
                      </ul>
                    </section>

                    <section
                      className="qa-card qa-success-item"
                      style={{ "--i": 3 }}
                    >
                      <div className="qa-card-title">Settings in effect</div>
                      <ul className="qa-status-list">
                        <li
                          className={
                            completedSummary?.gitReady ? "is-ok" : "is-warn"
                          }
                        >
                          <HarnessIcon
                            name={completedSummary?.gitReady ? "check" : "info"}
                            size={14}
                          />
                          <span>
                            {completedSummary?.repository?.provider === "ssh" ? "Git SSH Access:" : "GitHub Access:"}
                            {completedSummary?.gitReady
                              ? "Ready"
                              : "Not configured. You can add this in Personal Settings before cloning/pushing private repositories."}
                          </span>
                        </li>
                        <li
                          className={
                            completedSummary?.codeBuddyReady || sponsoredModel
                              ? "is-ok"
                              : "is-warn"
                          }
                        >
                          <HarnessIcon
                            name={
                              completedSummary?.codeBuddyReady
                                ? "check"
                                : "info"
                            }
                            size={14}
                          />
                          <span>
                            CodeBuddy API Key:{" "}
                            {completedSummary?.codeBuddyReady
                              ? "Configured"
                              : sponsoredModel
                                ? `Not configured. Conversations and SOPs will use the platform shared Key (available models: ${sharedModelNames(sponsoredModels, sponsoredModel)}). You can start immediately; configure your own Key to use any model.`
                                : "Not configured. Conversations can use the platform default model, but SOP nodes require it to call models. Please add it in Personal Settings first."}
                          </span>
                        </li>
                        <li className="is-ok">
                          <HarnessIcon name="check" size={14} />
                          <span>
                            Project:
                            {completedSummary?.project?.name || "Current project"}
                            {completedSummary?.repository?.name
                              ? ` · Repository ${completedSummary.repository.name}`
                              : " · Repository can be specified at runtime"}
                          </span>
                        </li>
                      </ul>
                    </section>
                  </div>

                  <div className="qa-actions-grid">
                    <button
                      type="button"
                      className="qa-action is-primary qa-success-item"
                      style={{ "--i": 4 }}
                      onClick={() => onClose?.()}
                    >
                      <span className="qa-action-icon">
                        <HarnessIcon name="play" size={16} />
                      </span>
                      <span className="qa-action-copy">
                        <strong>Start the first requirement</strong>
                        <small>
                          Return to the workspace input box and describe the requirement or issue directly.
                        </small>
                      </span>
                      <HarnessIcon
                        name="chevron-right"
                        size={16}
                        className="qa-action-chevron"
                      />
                    </button>
                    <button
                      type="button"
                      className="qa-action qa-success-item"
                      style={{ "--i": 5 }}
                      data-hover-ink-control=""
                      onClick={() => {
                        onClose?.();
                        onOpenView?.("sops");
                      }}
                    >
                      <span className="qa-action-icon">
                        <HarnessIcon name="workflow" size={16} />
                      </span>
                      <span className="qa-action-copy">
                        <strong>View or modify SOP</strong>
                        <small>
                          View the default SOP in the workflow template, or copy it to the project for customization.
                        </small>
                      </span>
                      <HarnessIcon
                        name="chevron-right"
                        size={16}
                        className="qa-action-chevron"
                      />
                    </button>
                  </div>
                </div>
              </div>
              <footer className="qa-footer">
                <div className="qa-footer-spacer" />
                <button
                  type="button"
                  className="qa-btn qa-btn-ghost"
                  data-hover-ink-control=""
                  onClick={onClose}
                >
                  Close
                </button>
              </footer>
            </>
          ) : (
            <>
              <div ref={bodyRef} className="qa-body">
                <div
                  key={activeStep.id}
                  className={`qa-stage ${stepAnimated ? "is-entering" : ""}`}
                  data-direction={direction}
                >
                  <div className="qa-kicker">
                    Step  {activeStepIndex + 1}  of  {wizardStepCount}  steps
                  </div>
                  <h3 ref={headingRef} tabIndex={-1} className="qa-title">
                    {activeStep.title}
                  </h3>

                  {error ? (
                    <p key={error} className="qa-note is-err" role="alert">
                      <HarnessIcon name="info" size={14} interactive={false} />
                      <span>{englishMessage(error)}</span>
                    </p>
                  ) : null}

                  {activeStep.id === "auth" ? (
                    <div className="qa-pane">
                      <section className="qa-cred-card">
                        <header className="qa-cred-head">
                          <div>
                            <strong>GitHub Repository Authorization</strong>
                            <span>
                              Used for cloning private repositories, creating branches, pushing code, and initiating PRs.
                            </span>
                          </div>
                          <StatusPill ok={gitReady} />
                        </header>
                        <div className="qa-cred-body">
                          <button type="button" className="qa-btn qa-btn-primary qa-btn-sm" onClick={() => openCredentialSettings("gitToken")}>
                            {storedUser?.gitHubCredentialConfigured ? "Manage GitHub Authorization" : "Connect GitHub"}
                          </button>
                          <p className="qa-hint">Complete authorization in Personal Settings and return to continue; no need to manually copy tokens.</p>
                          <p className="qa-hint">GitLab and other SSH repositories:<button type="button" className="qa-link-btn" onClick={() => openCredentialSettings("gitSshKey")}>{hasSSHKeys ? "Manage Git SSH Keys" : "Configure Git SSH key"}</button></p>
                          <p className="qa-hint">Workspace access to GitLab, GitHub Enterprise, and other HTTPS hosts:<button type="button" className="qa-link-btn" onClick={() => openCredentialSettings("gitHttpCredentials")}>{storedUser?.gitHttpCredentialsConfigured ? "Manage Git access tokens" : "Configure Git access tokens"}</button></p>
                          <details>
                            <summary>Use Access Token (Advanced)</summary>
                          <div className="qa-input-row">
                            <input
                              type="password"
                              className="qa-input"
                              value={gitToken}
                              onChange={(e) => setGitToken(e.target.value)}
                              placeholder={
                                storedUser?.gitHubCredentialConfigured
                                  ? "Configured; leave blank to keep it"
                                  : "GitHub personal access token (grants read/write permissions for Contents and Pull requests)"
                              }
                              autoComplete="new-password"
                            />
                            <button
                              type="button"
                              className="qa-btn qa-btn-outline qa-btn-sm qa-btn-field"
                              data-hover-ink-control=""
                              aria-busy={verifyingGit || undefined}
                              disabled={
                                !verifyingGit &&
                                !gitToken.trim() &&
                                !storedUser?.gitHubCredentialConfigured
                              }
                              onClick={verifyGit}
                            >
                              <BusyLabel
                                busy={verifyingGit}
                                busyLabel="Validating…"
                              >
                                Checks
                              </BusyLabel>
                            </button>
                            <a
                              className="qa-link"
                              data-hover-ink-control=""
                              href="https://github.com/settings/tokens"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Request token ↗
                            </a>
                          </div>
                          {gitVerify ? (
                            <VerifyMessage
                              result={gitVerify}
                              okText={`Token valid${gitVerify.login ? ` (${gitVerify.login})` : ""}`}
                            />
                          ) : null}
                          </details>
                        </div>
                      </section>

                      <section className="qa-cred-card">
                        <header className="qa-cred-head">
                          <div>
                            <strong>CodeBuddy API Key</strong>
                            <span>
                              {sponsoredModel
                                ? "Optional: If not configured, conversations and SOPs use the platform's shared model. Once configured, you can select other models."
                                : "Used when AI conversations and SOP nodes call models"}
                            </span>
                          </div>
                          <StatusPill ok={codeBuddyReady} />
                        </header>
                        <div className="qa-cred-body">
                          <div className="qa-field">
                            <span className="qa-label">Network</span>
                            <HarnessSelect
                              value={codeBuddyEnv}
                              options={CODEBUDDY_ENVIRONMENTS.map((env) => ({
                                value: env.value,
                                label: env.label,
                                hint: env.site,
                              }))}
                              onChange={setCodeBuddyEnvChoice}
                              ariaLabel="CodeBuddy network environment"
                            />
                          </div>
                          <div className="qa-input-row">
                            <input
                              type="password"
                              className="qa-input"
                              value={codeBuddyApiKey}
                              onChange={(e) =>
                                setCodeBuddyApiKey(e.target.value)
                              }
                              placeholder={
                                storedUser?.codeBuddyApiKeyConfigured
                                  ? "Configured; leave blank to keep it"
                                  : "Paste CodeBuddy API Key"
                              }
                              aria-label="CodeBuddy API Key"
                              autoComplete="new-password"
                            />
                            <a
                              className="qa-link"
                              data-hover-ink-control=""
                              href={codeBuddyKeyURL(codeBuddyEnv)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Get API Key ↗
                            </a>
                          </div>
                          <p
                            className={`qa-hint${codeBuddyWarning ? " is-warn" : ""}`}
                            role="status"
                          >
                            {codeBuddyWarning ||
                              `${codeBuddyEnvLegacy && codeBuddyEnvChoice === null ? `The previously entered "${storedCodeBuddyEnvRaw}" could not be recognized. CodeBuddy is actually connecting to the international site. Click Next to change to the current selection.` : ""}Keys can only be used on the site where they were created: current selection${codeBuddyEnvInfo.label} (${codeBuddyEnvInfo.site}). "Get API Key" will open the key page for that site.`}
                          </p>
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {activeStep.id === "project" ? (
                    <div className="qa-pane">
                      {editableProjects.length ? (
                        <SlidingTabs
                          className="qa-sliding-tabs qa-sliding-tabs-inline"
                          aria-label="Project selection method"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={projectMode === "existing"}
                            onClick={() => setProjectMode("existing")}
                          >
                            <HarnessIcon name="folder" size={14} />
                            Select existing project
                            <span className="sliding-tab-count">
                              {editableProjects.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={projectMode === "create"}
                            onClick={() => setProjectMode("create")}
                          >
                            <HarnessIcon name="sparkles" size={14} />
                            New project
                          </button>
                        </SlidingTabs>
                      ) : null}

                      {projectMode === "existing" && editableProjects.length ? (
                        <section
                          key="existing"
                          className="qa-section qa-fade-in"
                        >
                          <div className="qa-field">
                            <span className="qa-label">Select project</span>
                            <HarnessSelect
                              value={currentProject?.id || ""}
                              options={projectSelectOptions}
                              onChange={setSelectedProjectId}
                              searchable={projectSelectOptions.length > 4}
                              searchPlaceholder="Search project name or Key…"
                              ariaLabel="Select project"
                            />
                          </div>
                          {projectRepos.length ? (
                            <div className="qa-bound-repo-list">
                              {projectRepos.map((repo) => {
                                const isDef =
                                  repo.id ===
                                  (currentProject?.defaultRepositoryId ||
                                    defaultRepo?.id);
                                return (
                                  <div key={repo.id} className="qa-bound-repo">
                                    <span
                                      className={`qa-status-pill ${isDef ? "is-ok" : ""}`}
                                    >
                                      {isDef ? "Default repository" : "Linked repositories"}
                                    </span>
                                    <strong>{repo.name}</strong>
                                    <code>
                                      {repo.provider === "github" && repo.webUrl
                                        ? repo.webUrl.replace(
                                            /^https?:\/\//,
                                            "",
                                          )
                                        : repo.gongfengProjectId || repo.webUrl || repo.cloneUrl}
                                    </code>
                                    <small>
                                      {repo.defaultBranch || "main"}
                                    </small>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </section>
                      ) : (
                        <section
                          key="create"
                          className="qa-section qa-grid-3 qa-fade-in"
                        >
                          <label className="qa-field">
                            <span className="qa-label">
                              Project name <em>*</em>
                            </span>
                            <input
                              className="qa-input"
                              value={newProjectName}
                              onChange={(e) => {
                                const value = e.target.value;
                                setNewProjectName(value);
                                if (!idTouched)
                                  setNewProjectId(
                                    slugifyProjectId(value) || "my-project",
                                  );
                                if (!keyTouched)
                                  setNewProjectKey(deriveProjectKey(value));
                              }}
                              placeholder="Example: Smart Gateway"
                            />
                          </label>
                          <label className="qa-field">
                            <span className="qa-label">
                              Project ID <em>*</em>
                            </span>
                            <input
                              className="qa-input qa-mono"
                              value={newProjectId}
                              onChange={(e) => {
                                setIdTouched(true);
                                setNewProjectId(e.target.value);
                              }}
                              placeholder="gateway-service"
                            />
                          </label>
                          <label className="qa-field">
                            <span className="qa-label">Project key</span>
                            <input
                              className="qa-input qa-mono"
                              value={newProjectKey}
                              onChange={(e) => {
                                setKeyTouched(true);
                                setNewProjectKey(e.target.value.toUpperCase());
                              }}
                              placeholder="GW"
                            />
                          </label>
                        </section>
                      )}

                      <section
                        className={`qa-cred-card ${bindRepoNow ? "" : "is-collapsed"}`}
                      >
                        <header className="qa-cred-head">
                          <div>
                            <strong>
                              {projectMode === "existing" && projectRepos.length
                                ? "Add GitHub repository to this project"
                                : "Bind default GitHub repository"}
                            </strong>
                            <span
                              key={String(bindRepoNow)}
                              className="qa-fade-in"
                            >
                              {projectMode === "existing" && projectRepos.length
                                ? bindRepoNow
                                  ? "You can add new repositories to existing projects and reuse existing workflows and roles; leave blank to keep current repositories"
                                  : "Keep project's existing repositories and workflows"
                                : bindRepoNow
                                  ? "Paste Git HTTPS link or Git SSH address to automatically set as the project's default repository"
                                  : "Skipped. You can bind later when dispatching requirements or in project settings"}
                            </span>
                          </div>
                          <HarnessSwitch
                            checked={bindRepoNow}
                            onChange={setBindRepoNow}
                            label="Add or bind code repository"
                          />
                        </header>

                        <div
                          className={`qa-collapse ${bindRepoNow ? "" : "is-closed"}`}
                          inert={!bindRepoNow}
                          aria-hidden={!bindRepoNow || undefined}
                        >
                          <div className="qa-collapse-inner">
                            <div className="qa-cred-body">
                              {repoBindBlocked ? (
                                <div
                                  className="qa-hint is-warn qa-repo-permission"
                                  role="note"
                                >
                                  <p>
                                    “{currentProject?.name}” is an existing project. Only its
                                    Owner or platform administrators can bind repositories. You can:
                                  </p>
                                  <div className="qa-repo-permission-actions">
                                    <button
                                      type="button"
                                      className="qa-link-btn"
                                      onClick={() => {
                                        setError("");
                                        setProjectMode("create");
                                      }}
                                    >
                                      Create your own project and bind
                                    </button>
                                    <button
                                      type="button"
                                      className="qa-link-btn"
                                      onClick={() => {
                                        setError("");
                                        setBindRepoNow(false);
                                      }}
                                    >
                                      Skip binding and continue exploring
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                              <div className="qa-repo-grid">
                                <label className="qa-field">
                                  <span className="qa-label">
                                    {projectMode === "existing" &&
                                    projectRepos.length
                                      ? "Additional repository URL (optional)"
                                      : "Git HTTPS link or Git SSH address"}
                                  </span>
                                  <input
                                    className="qa-input qa-mono"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo"
                                  />
                                </label>
                                <div className="qa-field">
                                  <span className="qa-label">Default branch</span>
                                  <HarnessSelect
                                    value={repoBranch}
                                    options={BRANCH_OPTIONS}
                                    onChange={setRepoBranch}
                                    searchable
                                    allowCustom
                                    searchPlaceholder="Select or enter branch name…"
                                    ariaLabel="Default branch"
                                  />
                                </div>
                              </div>
                              {projectMode === "existing" &&
                              projectRepos.length &&
                              parsedRepo ? (
                                <div className="qa-repo-default-row qa-msg-in">
                                  <span>
                                    Recognized <code>{parsedRepo.project}</code>
                                    , and set as project default repository
                                  </span>
                                  <HarnessSwitch
                                    checked={makeDefaultRepo}
                                    onChange={setMakeDefaultRepo}
                                    label="Set as the project's default repository"
                                  />
                                </div>
                              ) : parsedRepo ? (
                                <p
                                  key="recognized"
                                  className="qa-hint is-ok qa-msg-in"
                                >
                                  Repository identified:
                                  <code>{parsedRepo.project}</code>
                                  (repository name <code>{parsedRepo.name}</code>)
                                </p>
                              ) : (
                                <p key="help" className="qa-hint">
                                  Supports Git HTTPS links or Git SSH addresses, e.g. <code>git@gitlab.com:group/repo.git</code>.
                                </p>
                              )}
                              {selectedSSHRepo?.provider === "ssh" && sshKeysLoaded && !sshReady ? (
                                <p className="qa-hint is-error" role="alert">
                                  {sshCredentials.error ? "Unable to load SSH key settings. Please try again later." : `No SSH key configured for ${selectedSSHRepo.host}. Add one later under “Personal settings → Git SSH keys”.`}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {activeStep.id === "workflow" ? (
                    <div className="qa-pane">
                      <div className="qa-field">
                        <span className="qa-label">Default delivery SOP</span>
                        <HarnessSelect
                          value={activeWorkflow?.id || DEFAULT_SOP_ID}
                          options={sopSelectOptions}
                          onChange={setSelectedWorkflowId}
                          ariaLabel="Default delivery SOP"
                        />
                      </div>

                      <section className="qa-card qa-canvas">
                        <div className="qa-canvas-head">
                          <SlidingTabs
                            className="qa-sliding-tabs qa-sliding-tabs-inline"
                            aria-label="Workflow and role preview"
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={previewTab === "stages"}
                              onClick={() => setPreviewTab("stages")}
                            >
                              <HarnessIcon name="workflow" size={14} />
                              Stage chain
                              <span className="sliding-tab-count">
                                {nodes.length}
                              </span>
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={previewTab === "roles"}
                              onClick={() => setPreviewTab("roles")}
                            >
                              <HarnessIcon name="user" size={14} />
                              Default Role
                              <span className="sliding-tab-count">
                                {roles.length}
                              </span>
                            </button>
                          </SlidingTabs>
                        </div>

                        {previewTab === "stages" ? (
                          <div
                            key="stages"
                            className="qa-flow-track qa-stagger"
                            aria-label="SOP stage preview"
                          >
                            <div
                              className="qa-flow-node is-edge"
                              style={{ "--i": 0 }}
                            >
                              <strong>Start</strong>
                              <span>Requirement input</span>
                            </div>
                            {nodes.map((node, index) => (
                              <React.Fragment key={node.id || index}>
                                <span
                                  className="qa-flow-arrow"
                                  aria-hidden="true"
                                  style={{ "--i": index * 2 + 1 }}
                                >
                                  →
                                </span>
                                <div
                                  className="qa-flow-node"
                                  style={{ "--i": index * 2 + 2 }}
                                >
                                  <strong>{node.name}</strong>
                                  <span>Stage {index + 1}</span>
                                </div>
                              </React.Fragment>
                            ))}
                            <span
                              className="qa-flow-arrow"
                              aria-hidden="true"
                              style={{ "--i": nodes.length * 2 + 1 }}
                            >
                              →
                            </span>
                            <div
                              className="qa-flow-node is-edge"
                              style={{ "--i": nodes.length * 2 + 2 }}
                            >
                              <strong>Done</strong>
                              <span>MR and artifacts</span>
                            </div>
                          </div>
                        ) : (
                          <div key="roles" className="qa-role-chips qa-stagger">
                            {roles.map((role, index) => (
                              <span
                                key={role.id}
                                className="qa-role-chip"
                                style={{ "--i": index }}
                              >
                                <i>{(role.name || "Role").slice(0, 1)}</i>
                                <b>{role.name}</b>
                                {role.description ? (
                                  <small>{role.description}</small>
                                ) : null}
                              </span>
                            ))}
                          </div>
                        )}
                      </section>

                      <section className="qa-card">
                        <div className="qa-card-title">Configuration to be applied</div>
                        <dl className="qa-summary">
                          <div>
                            <dt>Credential</dt>
                            <dd>
                              <span
                                className={`qa-dot ${(sshRepository ? sshReady : gitReady) && (codeBuddyReady || sponsoredModel) ? "is-ok" : ""}`}
                              />
                              <span>
                                {sshRepository ? "Git SSH" : "GitHub"} {(sshRepository ? sshReady : gitReady) ? "Configured" : "Not configured"} ·
                                CodeBuddy{" "}
                                {codeBuddyReady
                                  ? "Configured"
                                  : sponsoredModel
                                    ? "Use platform shared model"
                                    : "Not configured"}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt>Projects &amp; repositories</dt>
                            <dd>
                              <span className="qa-dot is-ok" />
                              <span>
                                {projectMode === "create"
                                  ? `Create new project “${newProjectName || "New project"}”`
                                  : `Use existing project “${currentProject?.name || "Current project"}”`}
                                {" · "}
                                {bindRepoNow && parsedRepo && !repoBindBlocked
                                  ? `Bind ${parsedRepo.name}`
                                  : defaultRepo?.name || "Specify repository at runtime"}
                              </span>
                            </dd>
                          </div>
                          <div>
                            <dt>Default SOP</dt>
                            <dd>
                              <span className="qa-dot is-ok" />
                              <span>
                                {activeWorkflow?.name || "Backend delivery SOP"} (
                                {roles.length} default roles)
                              </span>
                            </dd>
                          </div>
                        </dl>
                      </section>
                    </div>
                  ) : null}
                </div>
              </div>

              <footer className="qa-footer">
                <button
                  type="button"
                  className="qa-btn qa-btn-ghost"
                  data-hover-ink-control=""
                  disabled={saving}
                  onClick={onClose}
                >
                  Later
                </button>
                <div className="qa-footer-spacer" />
                {step > 0 ? (
                  <button
                    type="button"
                    className={`qa-btn qa-btn-outline ${stepAnimated && step === 1 && direction === "forward" ? "qa-back-enter" : ""}`}
                    data-hover-ink-control=""
                    disabled={saving}
                    onClick={() => {
                      setError("");
                      goToStep(Math.max(0, step - 1));
                    }}
                  >
                    <HarnessIcon name="chevron-left" size={14} />
                    Back
                  </button>
                ) : null}
                <button
                  type="button"
                  className="qa-btn qa-btn-primary"
                  aria-busy={saving || undefined}
                  disabled={loading && !saving}
                  onClick={nextStep}
                >
                  <BusyLabel busy={saving} busyLabel="Saving…">
                    {activeStep.id === "workflow" ? "Complete onboarding" : "Next"}
                    <HarnessIcon
                      name={
                        activeStep.id === "workflow"
                          ? "sparkles"
                          : "chevron-right"
                      }
                      size={14}
                    />
                  </BusyLabel>
                </button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
