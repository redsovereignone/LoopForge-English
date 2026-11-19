export const actionNames = {
  runs_start: "Start SOP",
  runs_approve: "Approve Node",
  runs_reject: "Reject Node",
  runs_retry: "Retry step",
  runs_cancel: "Cancel run",
  runs_pause: "Pause run",
  runs_resume: "Continue",
  issues_dispatch: "Dispatch SOP",
  issues_save: "Save requirement",
  issues_import_tapd: "Import TAPD Requirement",
  issues_chat_clarify: "Initiate AI Requirement Clarification",
  issues_clarification_save: "Save and Write Back Requirement Clarification",
  issues_delete: "Delete requirement",
  issues_comments_add: "Add Requirement Comment",
  issues_reopen: "Reopen Requirement",
  workflows_save: "Save SOP",
  workflows_clone: "Copy SOP",
  workflows_publish: "Publish SOP",
  agents_save: "Save role",
  assistant_tasks_save: "Save job",
};
const entities = {
  agents: "Role",
  workflows: "SOP",
  projects: "Project",
  repositories: "Repository",
  rules: "Rules",
  skills: "Skills",
  mcp_servers: "MCP Service",
  schedule_jobs: "Platform scheduled job",
  assistant_tasks: "Assistant scheduled job",
  runs: "Runs",
  issues: "Requirements",
  environments: "Environments",
  sandboxes: "Sandboxes",
  dockerfiles: "Dockerfile",
  executors: "Executor",
};
const verbs = {
  save: "Save",
  delete: "Delete",
  publish: "Publish",
  clone: "Copy",
  start: "Start",
  cancel: "Cancel",
  retry: "Retry",
  pause: "Pause",
  resume: "for",
  run: "Run",
  import: "Import",
  restore: "Resume",
};
export const actionName = (tool) => {
  if (actionNames[tool]) return actionNames[tool];
  const match = tool?.match(/^(.*)_([^_]+)$/);
  return match && entities[match[1]] && verbs[match[2]]
    ? verbs[match[2]] + entities[match[1]]
    : tool
      ? `Run ${tool}`
      : "No operation specified";
};
export const visibleSidebarArtifact = (a) =>
  !a.draft ||
  !!definitionTarget(a) ||
  (!a.draft.saved && !a.draft.resolved && !a.draft.inherited);

export function definitionTarget(artifact, projectId = "") {
  if (!["sop", "role"].includes(artifact?.kind)) return null;
  if (artifact.draft && !artifact.draft.saved) return null;
  const saved =
    artifact.draft?.savedResult?.data || artifact.draft?.savedResult;
  const asset = artifact.asset || saved;
  if (!asset?.id) return null;
  const project =
    asset.projectId || artifact.draft?.body?.projectId || projectId;
  return {
    id: asset.id,
    href: `/${project ? `?projectId=${encodeURIComponent(project)}` : ""}#/${artifact.kind === "sop" ? "flow" : "agents"}/${encodeURIComponent(asset.id)}`,
    label: artifact.kind === "sop" ? "Open SOP Orchestration" : "Open Role Definition",
  };
}

// After a new project is created from a chat the user wants to keep working in
// it, but the chat stays bound to its own project and the assistant cannot
// switch it. Link to the Studio with the new project selected.
export function projectEntryTarget(draft, currentProjectId = "") {
  if (draft?.tool !== "projects_save" || !draft.saved) return null;
  const saved = draft.savedResult?.data || draft.savedResult || {};
  const id = saved.id || draft.body?.id;
  if (!id || id === currentProjectId) return null;
  return {
    href: `/?projectId=${encodeURIComponent(id)}#/collaboration`,
    label: `Enter project "${saved.name || draft.body?.name || id}" to continue the conversation`,
  };
}

// A historical approval draft may already have been approved in a later turn.
// Derive its current display state without rewriting its execution receipt.
export function reconcileOperation(artifact, runs) {
  const draft = artifact.draft;
  if (!draft || draft.saved || draft.inherited || draft.tool !== "runs_approve")
    return artifact;
  const run = runs.find((r) => r.id === draft.path?.id);
  const node = run?.nodes?.[draft.body?.nodeId];
  if (!["succeeded", "skipped"].includes(node?.status)) return artifact;
  return { ...artifact, source: "Completed", draft: { ...draft, resolved: true } };
}
