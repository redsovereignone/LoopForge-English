export const referenceTypes = [
  { type: "agent", label: "Role", hint: "Dispatch to role" },
  { type: "skill", label: "Skills", hint: "Use this skill" },
  { type: "issue", label: "Requirements", hint: "Find requirements and acceptance criteria" },
  { type: "sop", label: "SOP", hint: "Reference a workflow" },
  { type: "run", label: "Runs", hint: "Check task progress" },
  { type: "repository", label: "Repository", hint: "Add repository context" },
];
export function mentionAt(text, caret, references = []) {
  const before = text.slice(0, caret);
  const match = before.match(/@([^@\n]*)$/);
  if (!match || /[a-z0-9_.+-]/i.test(before[match.index - 1] || ""))
    return null;
  if (references.some((ref) => match[1].startsWith((ref.name || ref.id) + " ")))
    return null;
  return { start: match.index, end: caret, query: match[1] };
}
export function insertMention(text, range, reference) {
  const token = `@${reference.name || reference.id} `;
  return {
    text: text.slice(0, range.start) + token + text.slice(range.end),
    caret: range.start + token.length,
  };
}
