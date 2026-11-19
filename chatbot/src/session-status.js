import { englishMessage } from "./english-message.js";
const states = {
  running: { state: "running", label: "Replying", icon: "arc-spinner", busy: true },
  // 回复结束不再画勾：侧栏只提示进行中、异常和待接话的状态，
  // 避免每行都挂一个表示“已回复”的对勾。
  completed: { state: "completed", label: "Reply completed" },
  failed: { state: "failed", label: "Reply failed", icon: "alert" },
  // 手动停止和回复完成一样是结束状态：侧栏不再挂停止方块，
  // 否则被停过的会话会一直留着一个像“还能再点一次”的停止图标。
  cancelled: { state: "cancelled", label: "Reply stopped" },
  interrupted: { state: "interrupted", label: "Reply interrupted", icon: "warning" },
  idle: { state: "idle", label: "No replies are currently being generated", icon: "chat" },
};

// A generation describes a model reply, never the completion of a project/task.
// Only the selected session supplies live generation/submission information.
export function sessionReplyStatus(session, { generation, busy = false } = {}) {
  const matching = generation && (!generation.sessionId || generation.sessionId === session.id);
  const value = busy ? "running" : (matching && generation.status) || session.generationStatus;
  return states[value === "canceled" ? "cancelled" : value] || states.idle;
}

// A completed reply the reader has not opened yet carries a blue dot, as in
// Codex; once read, a completed row is quiet again.
const unreadState = { state: "unread", label: "New unread reply", dot: true };

export function sidebarReplyStatus(status, unread = false) {
  return unread && status.state === "completed" ? unreadState : status;
}

// Run sessions only earn a chip while something needs the reader: a running
// SOP, a run waiting for a person, or a failure. Finished runs stay quiet; the
// title already says which SOP they belong to.
const runStates = {
  running: { state: "running", label: "Running" },
  waiting: { state: "waiting", label: "Pending" },
  failed: { state: "failed", label: "Failed" },
};

export function runSessionState(session) {
  if (!session?.shared || !session?.runId) return null;
  const state = runStates[session.runStatus];
  if (!state) return null;
  return { ...state, label: englishMessage(session.runStatusLabel) || state.label };
}

// The hover text of a history row. A run conversation's title says what the
// run does, so its SOP and run state are named here instead of in the row.
export function sessionTooltip(session, { projectName = "", replyLabel = "" } = {}) {
  const run = Boolean(session?.shared && session?.runId);
  const title = session?.displayTitle || session?.title || "New chat";
  const sop = run && session.sopName && !title.includes(session.sopName) ? session.sopName : "";
  return [title, projectName, sop, run ? englishMessage(session.runStatusLabel) || replyLabel : replyLabel]
    .filter(Boolean)
    .join(" · ");
}
