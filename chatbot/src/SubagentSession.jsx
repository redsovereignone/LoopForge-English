import React, { useEffect, useState } from "react";
import HarnessIcon from "./HarnessIcon";
import SlidingTabs from "./SlidingTabs";
import ActivityTrace from "./ActivityTrace";
import { RichContent } from "./RichContent";
import { resumeMissed } from "./activity";

export function subagentStatus(agent, live) {
  const last = agent.dispatches.at(-1);
  if (last?.failed) return { label: "Failed", tone: "failed" };
  if (!last?.finishedAt)
    return live
      ? { label: "Running", tone: "running" }
      : { label: "Interrupted", tone: "interrupted" };
  return { label: "Completed", tone: "done" };
}

export function subagentName(agent) {
  return agent.role || agent.subagent || "Subagent";
}

// The subagent's last paragraph is its report, which also comes back as the
// Agent result; it is shown once, as the reply.
function processSteps(step) {
  const report = (step.output || "").replace(/\s+/g, "");
  return (step.children || []).filter(
    (child) =>
      !(
        report &&
        child.kind === "text" &&
        report.includes((child.text || "").replace(/\s+/g, ""))
      ),
  );
}

// SubagentSession shows one subagent like an SOP node: what Main Bot asked,
// the model it ran on, how it worked and what it reported, once per dispatch
// when it was resumed, plus its collected deliverables and what it published.
export function SubagentSession({ agent, live = false, artifacts = [], onOpenArtifact }) {
  const [tab, setTab] = useState("conversation");
  useEffect(() => setTab("conversation"), [agent.key]);
  // A deliverable opens the attachment of the reply that holds its dispatch,
  // not an older file of the same name. Until that reply is saved there is
  // no attachment yet.
  const published = agent.published.map((item) => {
    const pending = item.source === "Deliverable" && !item.missing && item.messageIndex == null;
    const artifact =
      item.missing || pending
        ? null
        : [...artifacts]
            .reverse()
            .find(
              (artifact) =>
                artifact.name === item.title &&
                (item.source !== "Deliverable" || artifact.messageIndex === item.messageIndex),
            );
    return { ...item, pending, artifact };
  });
  return (
    <section
      className="sop-run-embedded sop-run-panel node-conversation-view subagent-session"
      aria-label="Subagent conversation"
    >
      <div className="sop-panel-scroll">
        <SlidingTabs className="node-tabs" aria-label="Subagent details">
          <button
            role="tab"
            aria-selected={tab === "conversation"}
            onClick={() => setTab("conversation")}
          >
            <HarnessIcon name="chat" size={14} />
            Conversation activity
          </button>
          <button
            role="tab"
            aria-selected={tab === "artifacts"}
            onClick={() => setTab("artifacts")}
          >
            <HarnessIcon name="doc" size={14} />
            Artifacts {published.length || ""}
          </button>
        </SlidingTabs>
        {tab === "conversation" ? (
          <div className="node-conversation">
            {agent.dispatches.map((step) => {
              const running = live && !step.finishedAt;
              const steps = processSteps(step);
              return (
                <React.Fragment key={step.id}>
                  {step.input || step.detail ? (
                    <article
                      className="node-message node-message-user"
                      aria-label="Assigned task"
                    >
                      <span className="node-message-sender">AI assistant</span>
                      <RichContent message={step.input || step.detail} />
                    </article>
                  ) : null}
                  {agent.models?.[step.id] ? (
                    <p className="muted subagent-model" aria-label="Model">
                      Model · {agent.models[step.id]}
                    </p>
                  ) : null}
                  {resumeMissed(step) ? (
                    <p className="muted subagent-resume-missed" role="note">
                      Could not resume  {step.resumed} . A new subagent was started.
                    </p>
                  ) : null}
                  {steps.length || running ? (
                    <ActivityTrace
                      steps={steps}
                      startedAt={step.startedAt}
                      finishedAt={step.finishedAt !== "done" ? step.finishedAt : null}
                      live={running}
                      interrupted={!live && !step.finishedAt}
                    />
                  ) : null}
                  {step.output ? (
                    <article
                      className="node-message node-message-assistant node-result"
                      aria-label="Subagent report"
                    >
                      <RichContent message={step.output} />
                    </article>
                  ) : step.failed ? (
                    <p className="error">Dispatch failed.</p>
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <div className="node-artifacts">
            {published.map(({ title, source, missing, pending, artifact }, index) =>
              artifact ? (
                <button
                  type="button"
                  className="artifact-row"
                  key={`${title}-${index}`}
                  onClick={() => onOpenArtifact?.(artifact)}
                >
                  <HarnessIcon name="doc" size={17} />
                  <span>
                    <strong>{title}</strong>
                    <small>{source}</small>
                  </span>
                  <HarnessIcon name="chevron-right" size={14} />
                </button>
              ) : (
                <div className="artifact-row" key={`${title}-${index}`} data-missing={missing || undefined}>
                  <HarnessIcon name={missing ? "alert" : "doc"} size={17} />
                  <span>
                    <strong>{title}</strong>
                    <small>{missing ? "Required deliverable missing" : pending ? "Deliverable · available after the reply" : source}</small>
                  </span>
                </div>
              ),
            )}
            {!published.length ? (
              <p className="muted">No deliverables or published artifacts from this subagent.</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
