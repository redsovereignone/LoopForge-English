import { actionName } from "./platform.js";

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((key) => value[key] !== undefined)
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
export function reviewedOperation(draft, review = {}) {
  const actual = {
    tool: draft.tool,
    path: draft.path,
    query: draft.query,
    body: draft.body,
  };
  if (
    review.expected &&
    JSON.stringify(canonical(actual)) !==
      JSON.stringify(canonical(review.expected))
  )
    throw Object.assign(Error("Operation content has been updated. Please re-verify before confirming."), {
      draftChanged: true,
    });
  const result =
    review.bodyPatch && draft.tool === "issues_import_tapd"
      ? {
          ...draft,
          body: {
            ...draft.body,
            repositoryIds: review.bodyPatch.repositoryIds,
            repositoryId: "",
          },
        }
      : draft;
  const invalid = operationValidation(result);
  if (invalid) throw Error(invalid);
  return result;
}

export function operationValidation(draft) {
  if (!draft?.tool) return "Missing operation name. Cannot execute.";
  if (draft.tool === "issues_import_tapd") {
    if (
      typeof draft.body?.projectId !== "string" ||
      !draft.body.projectId.trim()
    )
      return "Choose a target project before importing.";
    if (typeof draft.body?.url !== "string" || !draft.body.url.trim())
      return "Missing TAPD requirement link.";
    if (!repositoryIds(draft.body).length)
      return "Select at least one repository before confirming the import.";
  }
  return "";
}
export function repositoryIds(body) {
  return [
    ...new Set(
      [
        ...(Array.isArray(body?.repositoryIds) ? body.repositoryIds : []),
        body?.repositoryId,
      ]
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim()),
    ),
  ];
}
// Platform-level resources belong to no project; the session's project must not
// be shown as theirs (a new project would read "项目：<current project>").
const GLOBAL_SAVE_TOOLS = new Set([
  "projects_save",
  "business_domains_save",
  "sync_config_save",
]);
// repo.GenericBackendDeliveryWorkflowID, bound to new projects by default.
const DEFAULT_PROJECT_WORKFLOW = "generic-backend-delivery";
export function operationSummary(
  draft,
  { projects = [], references = [], projectId = "" } = {},
) {
  const body = draft.body || {};
  const project = GLOBAL_SAVE_TOOLS.has(draft.tool)
    ? ""
    : body.projectId || projectId;
  const named = (type, id) =>
    references.find((r) => r.type === type && r.id === id)?.name || id;
  const target = draft.path?.id || body.id;
  const existingProject =
    draft.tool === "projects_save" && projects.some((p) => p.id === target);
  // Mirrors saveProject: a new project without a workflowId is bound to the
  // generic backend SOP, so the card says so instead of showing nothing.
  const sop = body.workflowId
    ? named("sop", body.workflowId)
    : draft.tool === "projects_save" && !existingProject
      ? `${references.find((r) => r.type === "sop" && r.id === DEFAULT_PROJECT_WORKFLOW)?.name || "Backend delivery SOP"} (default)`
      : "";
  const fields = [
    [
      "Project",
      project ? projects.find((p) => p.id === project)?.name || project : "",
    ],
    ["Name", body.name || body.title],
    ["Target", draft.path?.id || body.id],
    ["TAPD Link", body.url],
    [
      "Repositories",
      repositoryIds(body)
        .map((id) => named("repository", id))
        .join(", "),
    ],
    ["SOP", sop],
    ["Step", body.nodeId],
    ["Description", body.description || body.reason],
  ].filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  const effect =
    {
      issues_import_tapd:
        "Import requirements from TAPD and associate them with the selected repositories. Continue the current conversation after import.",
      issues_dispatch: "Dispatch an SOP for this requirement and create a new run.",
      runs_start: "Start a new SOP run.",
      runs_approve: "Approve this node. The process will continue to the subsequent nodes.",
      runs_reject: "Reject this node. The process will continue along the SOP's rejection path.",
      issues_clarification_save: "Save the clarification results and write back to the requirement's external source.",
      projects_save: existingProject
        ? "Modify the settings for this project."
        : "Create a separate project outside the current conversation’s project.",
    }[draft.tool] || `${actionName(draft.tool)}, using the targets and parameters listed below.`;
  return { title: actionName(draft.tool), fields, effect };
}
export function operationError(value) {
  const text =
    value instanceof Error ? value.message : String(value || "Operation failed");
  try {
    const data = JSON.parse(text);
    if (typeof data.error === "string") return data.error;
    if (typeof data.error?.message === "string") return data.error.message;
  } catch {
    /* Plain text errors need no conversion. */
  }
  return text;
}
