const conversations = [
  {
    id: "home",
    title: "Polish the workspace home page for better usability",
    steps: ["Organize workspace hierarchy", "Unify sidebar dimensions", "Complete interaction acceptance items"],
    messages: [
      ["user", "Reference Grasp for the home page. Keep the original business functions, and tidy up the sidebar and button interactions."],
      ["assistant", "I will divide the workspace into common entries, conversation navigation, and content area. The entry bar remains 56px. The conversation sidebar uses 304px with a white background, light gray selected state, and thin borders.\n\nIdentified functions to retain: project and model selection, file references, conversation search, archiving, and renaming. Icons play their own animations; buttons remain in place."],
      ["user", "Group settings and execution machines together. Do not use two separate entries."],
      ["assistant", "Entries have been merged into Settings. Clicking defaults to Personal Settings; execution machines can still be opened from the settings list. Clicking the gear again returns to the home page. The button next to the title collapses the settings navigation.\n\n**Completed**: Sidebar dimensions, entry consolidation, borders, and hover colors.\n\n**Pending confirmation**: Ellipsis effect for long conversation titles, and reading space when the sidebar is expanded on narrow screens. Once confirmed, we can finalize this round of home page adjustments."],
    ],
  },
  {
    id: "release",
    title: "Organize this week's release list and acceptance items",
    steps: ["Summarize this week's changes", "Verify owners and acceptance items", "Organize release blockers"],
    messages: [
      ["user", "Help me organize the content to be released this week, listed by owner and acceptance status."],
      ["assistant", "This week's release scope has been divided into three items:\n\n| Content | Owner | Acceptance Status |\n| --- | --- | --- |\n| Login state restoration | Lin Yue | Passed on desktop, pending regression on mobile |\n| Task completion notifications | Chen Mo | Pending confirmation of default toggle |\n| Project list search | Zhou Ning | Normal and empty result flows passed |\n\nRelease notes can be drafted first, but the release time needs to be determined after the first two items are confirmed."],
      ["user", "List the blocking items separately and provide a recommended execution order."],
      ["assistant", "There are currently two release blockers:\n\n1. **Mobile login restoration**: Lin Yue to complete regression results for refreshing and reopening pages in Safari.\n2. **Notification default options**: Chen Mo to confirm which notifications are enabled by default for new users to avoid duplicate reminders after launch.\n\nIt is recommended to complete the mobile regression first, then confirm the notification copy and default values, and finally run the unified release acceptance. Project search has passed and can proceed directly to the release checklist without waiting for additional testing."],
    ],
  },
  {
    id: "flow",
    title: "Design the collaboration workflow from requirement analysis to testing",
    steps: ["Clarify stage inputs and outputs", "Add manual confirmation nodes", "Organize test rollback paths"],
    messages: [
      ["user", "I want to connect requirement analysis, development, and testing. Please help me design a collaboration workflow first."],
      ["assistant", "It is recommended that each stage advances only one clear result:\n\n- **Requirement Clarification**: Goals, scope, and acceptance criteria.\n- **Solution Review**: Implementation plan, impact scope, and key risks.\n- **Development Implementation**: Code changes and self-test records.\n- **Test Acceptance**: Regression results and outstanding issues.\n\nIf testing fails, return to development to avoid entering delivery with unresolved issues."],
      ["user", "Add manual confirmation before development, and allow rollback on test failure."],
      ["assistant", "Place manual confirmation after the solution review. The flowchart is as follows:\n\n```mermaid filename=requirement_collaboration_workflow.mmd\nflowchart TD\n  A[Requirement Clarification] --> B[Solution Review]\n  B --> C{Manual Confirmation}\n  C -->|Pass| D[Development Implementation]\n  C -->|Supplement info| A\n  D --> E[Test acceptance]\n  E -->|Failed| D\n  E -->|Passed| F[Delivery archive]\n```\n\nEach rollback records the reason and items to fix; confirmed items that already passed remain valid. The current flow is complete. Next, we need to confirm who is responsible for manual confirmation and who is the final approver for the testing phase."],
    ],
  },
  {
    id: "mobile",
    title: "Check mobile layout and interaction experience",
    steps: ["Check space allocation on narrow screens", "Address input area occlusion issues", "List mobile acceptance paths"],
    messages: [
      ["user", "Identify areas on mobile that need optimization, especially the sidebar and input box."],
      ["assistant", "Three priorities for narrow screens:\n\n1. The sidebar overlays the content area when open and restores full reading width when closed.\n2. Long titles occupy only one line, and additional actions remain clickable.\n3. The input box expands with content, but the model selector and send button positions are preserved.\n\nThis round covers two common widths: 390px and 430px."],
      ["user", "First resolve the issue of the sidebar taking up too much space, then check keyboard pop-up behavior."],
      ["assistant", "Change the sidebar to an overlay expansion; no blank column is reserved after closing. The settings panel uses the same expand and collapse behavior.\n\n**Current progress**: Navigation width and long title handling are complete.\n\n**Next steps**: On mobile, check if the input box is visible and the send button is not obscured after the keyboard pops up, and if focus returns to the input area after closing the sidebar. The desktop layout maintains the original multi-column workspace."],
    ],
  },
  {
    id: "search",
    title: "Add search and filtering to the project list",
    messages: [
      ["user", "The project list is growing. Add a search feature and a filter for projects I participate in."],
      ["assistant", "Search matches project names and descriptions. Filters offer 'All projects' and 'My projects'. They can be combined; the search term is preserved when switching filters.\n\nWhen there are no results, display the current conditions and provide an option to clear the search. If there are no projects at all, retain the original 'New Project' action."],
      ["user", "Handle leading/trailing spaces and case sensitivity. Switching filters should not navigate to another page."],
      ["assistant", "Leading/trailing spaces and case differences are now included in matching rules. Search and filtering only update the current list, keeping the page position stable.\n\nAcceptance covered Chinese names, English case sensitivity, pure spaces, no results, and combined filters. Results met expectations. Existing project details, new project creation, and member management entries remain available."],
    ],
  },
  {
    id: "settings",
    title: "Merge personal settings and workspace settings",
    messages: [
      ["user", "Separating personal and workspace settings is confusing. Merge them into a single settings entry."],
      ["assistant", "Use Settings as a unified entry point, defaulting to Personal Configuration, then grouped by management content:\n\n- Personal Configuration and Workspace Appearance\n- Project Configuration and Bot Management\n- Processes, Roles, and Capability Assets\n- Execution Machines and Runtime Environments\n\nExisting configuration forms retain their original save methods; navigation only organizes entry points."],
      ["user", "Entering Settings defaults to Personal Configuration; clicking the gear again returns to the home page."],
      ["assistant", "Organized according to this interaction: The first click on the gear opens Personal Configuration; clicking it again within Settings returns to the home page. The button next to the title only collapses the Settings navigation, preserving the current configuration page.\n\nVerified the Personal Configuration, Project Configuration, and Execution Machine paths; clicking the global gear returns to the home page in all cases. The conversation sidebar retains its own expansion state."],
    ],
  },
  {
    id: "icons",
    title: "Make the icon animations more natural.",
    messages: [
      ["user", "Don't let the button jump up and down on hover; just let the icon play its animation."],
      ["assistant", "Remove the button's displacement and scaling, keeping the internal stroke animation of the icon. Hover feedback is primarily shown through a light gray background and a ripple effect at the click point; the selected state uses a more stable gray.\n\nProvide feedback for keyboard focus as well, and shorten transitions when system settings reduce motion effects."],
      ["user", "Don't float the New Conversation button; unify the Settings and navigation icons."],
      ["assistant", "Removed the floating shadow from the New Conversation button; navigation and Settings entries use the same set of neutral colors. Icons can play internal animations, while button boundaries and text positions remain fixed.\n\nChecked mouse hover, keyboard focus, touch clicks, and disabled states; continuous enter/exit does not cause layout jitter. This round of interaction cleanup is ready for acceptance."],
    ],
  },
  {
    id: "review",
    title: "Organize pending issues in code reviews.",
    messages: [
      ["user", "Organize the review comments, addressing usability-impacting issues first, and style suggestions later."],
      ["assistant", "Review comments have been divided into three groups:\n\n| Priority | Issue | Resolution |\n| --- | --- | --- |\n| High | Old filter conditions persist after switching projects | Reset list state on switch |\n| Medium | Empty result page lacks a recovery entry | Add a clear conditions action |\n| Low | Inconsistent list spacing | Unify row height and padding |\n\nThe first two items affect the operational loop; recommend fixing and regressing them first."],
      ["user", "After handling the first two items, check if any user selections are lost."],
      ["assistant", "The first two items have been organized; regression results are as follows:\n\n- Switching projects clears inapplicable filter conditions, preventing the display of old project data.\n- The empty result page allows clearing conditions with one click, returning to the full list.\n- The user's selected model and workspace appearance were not overwritten by the list refresh.\n\nRemaining spacing adjustments have been logged separately and can be addressed in the next UI cleanup pass."],
    ],
  },
  {
    id: "docs",
    title: "Complete onboarding documentation for new team members",
    messages: [
      ["user", "New team members don't know where to start when they join. Add a project onboarding guide."],
      ["assistant", "The documentation will focus on completing the first collaboration: joining the project, checking personal configuration, selecting a model, starting a conversation, reviewing artifacts, and confirming delivery.\n\nInstallation details will be placed in the development environment section to avoid cluttering the first screen with configuration items. If permissions are insufficient, instruct users to contact the project owner for confirmation."],
      ["user", "Document the shortest operation path, then add frequently asked questions."],
      ["assistant", "The onboarding guide has been organized:\n\n```markdown filename=Project_Onboarding_Guide.md\n# Project Onboarding Guide\n\n## Completing Your First Collaboration\n1. Find your team's project in the project list and confirm you have joined.\n2. Open Settings and check the model credentials in your personal configuration.\n3. Return to the workspace and select the project and model.\n4. Start a new conversation, specifying the goal, constraints, and acceptance criteria.\n5. Review the documents and flowcharts in the artifact panel to confirm the next steps.\n\n## Frequently Asked Questions\n- Project not visible: Ask the project owner to check member permissions.\n- Unable to send messages: Check model credentials and network connection.\n- Unsure how to submit a requirement: First describe the problem to solve, then add the use case.\n\n## Pre-Delivery Checklist\n- Are all acceptance criteria met?\n- Is an owner assigned for any outstanding issues?\n- Can artifacts be retrieved from the conversation?\n```\n\nThe shortest path and FAQ have been added. New team members can follow the steps to verify the process; the guide will be updated based on actual blockers encountered."],
    ],
  },
  {
    id: "runners",
    title: "Check the connection status of the runner",
    messages: [
      ["user", "Runners sometimes show as offline. Let's organize the troubleshooting order."],
      ["assistant", "It is recommended to troubleshoot in four layers: heartbeat, network, credentials, and version:\n\n1. Check the latest heartbeat to distinguish between transient delays and persistent offline status.\n2. Verify the service process and network connectivity on the execution machine.\n3. Check if the connection credential has expired or been revoked.\n4. Verify the client version against console requirements.\n\nRecord the current task before troubleshooting to avoid losing context during reconnection."],
      ["user", "Clearly document the difference between offline and busy states to facilitate on-call judgment."],
      ["assistant", "Status descriptions have been completed:\n\n- **Online Idle**: Heartbeat is normal; ready to accept new tasks.\n- **Online Busy**: Heartbeat is normal; currently processing an existing task.\n- **Offline**: Heartbeat exceeds the threshold; check the process and connection.\n\nThe troubleshooting sequence and status descriptions have been organized. For busy machines, check the current task first; for persistent offline status, check the service. Ongoing work will not be interrupted solely based on list status."],
    ],
  },
  {
    id: "notify",
    title: "Optimize post-task completion message notifications",
    messages: [
      ["user", "There are too many messages after task completion. Handle success, failure, and cases requiring confirmation separately."],
      ["assistant", "Recommend layering based on whether your action is required:\n\n- Normal completion: Summarize in the workspace; do not pop up repeated reminders.\n- Execution failure: Retain the failure reason and reprocessing entry.\n- Awaiting confirmation: Clearly state the content requiring confirmation and the next step.\n\nMerge status updates for the same task to avoid treating process messages as multiple new notifications."],
      ["user", "Items awaiting confirmation must remain accessible and should not be lost after being marked as read."],
      ["assistant", "Notification rules have been completed: Marking as read only changes the reading status and does not remove pending confirmation items; items are collapsed from the to-do list only after confirmation is complete, while history remains viewable.\n\nAcceptance covers four paths: normal completion, consecutive failures, duplicate events, and reopening after reading. The conclusion is that the number of reminders can be reduced while retaining full access to failure handling and manual confirmation."],
    ],
  },
  {
    id: "summary",
    title: "Organize the delivery record for this iteration",
    messages: [
      ["user", "Compile the adjustments from this round into a delivery record, explaining what was changed and what remains pending."],
      ["assistant", "This round can be archived into three parts: navigation, interaction, and collaboration capabilities. The delivery record will retain both acceptance results and follow-up items to facilitate direct continuation in the next iteration.\n\nIt is important to highlight that original features remain accessible after entry consolidation, and that collapsing the sidebar does not affect the current conversation or configuration pages."],
      ["user", "Add verification results and the follow-up owner; keep the content concise."],
      ["assistant", "Delivery record has been organized:\n\n```markdown filename=Iteration_Delivery_Record.md\n# Delivery Record for This Round\n\n## Completed\n- Unified the width, borders, and selected colors for the workspace and settings navigation.\n- Merged personal settings, workspace management, and runner entry points.\n- Adjusted icon animations and button transitions to keep control positions stable.\n- Completed the operational loop for conversation search, archiving, and artifact viewing.\n\n## Verification Results\n- Primary navigation paths passed on desktop and mobile.\n- Collapsing and expanding settings preserves the current page.\n- Conversation content, model selection, and project context remain consistent.\n\n## Follow-up Items\n- Lin Yue: Supplement operation logs when the mobile keyboard appears.\n- Chen Mo: Collect first-time user feedback and confirm the explanatory copy.\n```\n\nCompleted items and follow-up owners for this round are clarified and can serve as the basis for iteration handover."],
    ],
  },
];

export function createLocalConversations(user, model) {
  const now = Date.now();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const elapsedToday = now - today.getTime();
  const userId = user?.id ?? 0;
  const authorName = user?.chineseName || user?.loginName || "Me";
  return conversations.map((fixture, index) => {
    const updated = index < 6
      ? today.getTime() + elapsedToday * (12 - index) / 12
      : yesterday.getTime() + (today.getTime() - yesterday.getTime()) * (18 - index) / 24;
    const gap = index < 6 ? Math.min(90_000, elapsedToday / 48) : 90_000;
    const created = updated - (fixture.messages.length - 1) * gap;
    return {
      id: `local-preview-${fixture.id}`,
      local: true,
      title: fixture.title,
      userId,
      projectId: "",
      model: model || "",
      archived: false,
      readOnly: false,
      participants: [{ id: userId, name: authorName }],
      generationStatus: "completed",
      createdAt: new Date(created).toISOString(),
      updatedAt: new Date(updated).toISOString(),
      messages: fixture.messages.map(([role, content], messageIndex) => ({
        role,
        content,
        createdAt: new Date(created + messageIndex * gap).toISOString(),
        ...(role === "user" ? { authorId: userId, authorName } : {}),
        ...(role === "assistant" && messageIndex === 1 && fixture.steps ? {
          activity: fixture.steps.map((text, stepIndex) => ({
            kind: "status",
            text,
            at: new Date(created + gap * (0.2 + stepIndex * 0.2)).toISOString(),
          })),
        } : {}),
      })),
    };
  });
}
