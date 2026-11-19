import React, { useEffect, useRef, useState } from "react";
import { SelectMenu } from "./ui";
import HarnessIcon from "./HarnessIcon";
import "./sandbox-picker.css";

export function conversationSandboxOptions(sandboxes, project, selected = "") {
  const available = (sandboxes || []).filter(
    (s) => s.driver === "docker" && (s.projectId === project?.id || s.shared),
  );
  const options = [
    { value: "", label: "Agent selects" },
    ...available.map((s) => ({ value: s.id, label: s.name || s.id })),
  ];
  if (selected && !available.some((s) => s.id === selected)) {
    options.push({
      value: selected,
      label: `Environment unavailable · ${selected}`,
      disabled: true,
    });
  }
  return options;
}

export default function SandboxPicker({ chat, onCreate }) {
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const disabled = !!(
    chat.busy ||
    chat.sandboxBusy ||
    chat.readOnly
  );
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  if (!chat.projectId) return null;
  if (chat.sandboxLocked) {
    return (
      <span
        className="sandbox-context sandbox-fixed"
        title="Task conversations use the task environment."
      >
        <HarnessIcon name="lock" size={12} interactive={false} />
        <span>{chat.workspaceSandbox?.name || "Task environment"}</span>
      </span>
    );
  }
  const project = chat.projects.find((p) => p.id === chat.projectId);
  const options = conversationSandboxOptions(
    chat.sandboxes,
    project,
    chat.sandboxProfileId,
  );
  const label =
    options.find((o) => o.value === chat.sandboxProfileId)?.label ||
    options[0].label;
  const menuOptions = options
    .filter((o) => !o.disabled)
    .map((o) => ({
      id: o.value,
      label: o.label,
      description: o.value ? "" : "Choose automatically for the code being changed. Use the standard Docker sandbox when uncertain.",
      icon: o.value ? "terminal" : "folder",
    }));
  return (
    <span className="menu-anchor sandbox-context" title={label}>
      <button
        ref={trigger}
        type="button"
        className="context-pill sandbox-picker"
        aria-label={`Environment: ${label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <HarnessIcon name="terminal" size={13} interactive={false} />
        <span>{label}</span>
        <HarnessIcon name="chevron-down" size={12} interactive={false} />
      </button>
      <SelectMenu
        open={open}
        label="Sandboxes"
        value={chat.sandboxProfileId || ""}
        options={menuOptions}
        onSelect={(id) => void chat.selectSandbox(id)}
        onClose={() => setOpen(false)}
        anchorRef={trigger}
        searchable
        actions={
          onCreate
            ? [
                {
                  id: "new-sandbox",
                  label: "Add sandbox",
                  icon: "plus",
                  onSelect: onCreate,
                },
              ]
            : []
        }
      />
    </span>
  );
}
