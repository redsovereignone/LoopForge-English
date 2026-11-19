import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

const { apiMock, writeMock } = vi.hoisted(() => ({
  apiMock: vi.fn(async (path) => {
    if (path.includes("/telemetry")) return { events: [], nextAfter: 0, hasMore: false };
    if (path.startsWith("/api/workflows?"))
      return [{ id: "wf1", name: "流程一", projectId: "p1", nodes: [] }];
    if (path.startsWith("/api/runs?"))
      return [{
        id: "r1", status: "succeeded", workflowId: "wf1", input: "完成任务",
        workflowSnapshot: { name: "交付流程", nodes: [{ id: "n1", name: "实现" }] },
        nodes: { n1: { status: "succeeded", output: "完成" } },
        artifacts: [{ id: "out", name: "out.md", mediaType: "text/markdown" }],
      }];
    if (path.includes("/references"))
      return { items: [{ id: "ISSUE-1", name: "需求一" }], nextOffset: 0 };
    if (path.startsWith("/api/issues/"))
      return { id: "ISSUE-1", title: "需求一" };
    if (path.startsWith("/api/runs/"))
      return {
        id: "r1", status: "succeeded", input: "完成任务",
        workflowSnapshot: { name: "交付流程", nodes: [{ id: "n1", name: "实现" }] },
        nodes: { n1: { status: "succeeded", output: "完成" } },
        artifacts: [{ id: "out", name: "out.md", mediaType: "text/markdown" }],
      };
    return [];
  }),
  writeMock: vi.fn(async (_path, body) => ({ id: "created", ...body })),
}));
vi.mock("../src/api.js", async (original) => ({
  ...(await original()),
  api: apiMock,
  write: writeMock,
}));
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: "<svg><text>diagram</text></svg>" })),
  },
}));
vi.mock("../src/presentation.js", async (original) => ({
  ...(await original()),
  exportPresentation: vi.fn(async () => {}),
}));

import ArtifactPanel from "../src/ArtifactPanel.jsx";
import IssueContext from "../src/IssueContext.jsx";
import {
  ArtifactPreview,
  Attachment,
  CodeBlock,
  CopyButton,
  Diagram,
  ImageLightbox,
  RichContent,
  Slides,
  ZoomableImage,
  safeSVG,
} from "../src/RichContent.jsx";
import RunAlerts from "../src/RunAlerts.jsx";
import SessionContextMenu from "../src/SessionContextMenu.jsx";
import SidePanel, { DraftCard } from "../src/SidePanel.jsx";
import SopRunPanel from "../src/SopRunPanel.jsx";
import {
  CredentialAction,
  Dialog,
  IconButton,
  Menu,
  SelectMenu,
} from "../src/ui.jsx";

const chat = {
  user: { id: 1 },
  projects: [{ id: "p1", name: "项目一" }],
  projectId: "p1",
  issueId: "",
  session: { id: "s1", projectId: "p1", messages: [] },
  busy: false,
  readOnly: false,
  linkIssue: vi.fn(async () => true),
  applyDraft: vi.fn(async () => ({})),
};
const run = {
  id: "r1",
  status: "failed",
  workflowSnapshot: {
    name: "交付流程",
    nodes: [{ id: "n1", name: "实现", type: "agent" }],
  },
  nodes: {
    n1: {
      nodeId: "n1",
      status: "failed",
      error: "未配置 CodeBuddy API Key",
      output: "失败",
    },
  },
  artifacts: [
    { id: "a1", nodeId: "n1", path: "result.md", mediaType: "text/markdown", size: 12, attempt: 1 },
  ],
};

describe("content and panels", () => {
  test("renders rich content formats and preview controls", async () => {
    const user = userEvent.setup();
    expect(safeSVG("<svg><script>x</script><path /></svg>")).not.toContain("script");
    render(
      <>
        <RichContent message={"# 标题\n\n[链接](https://example.com)\n\n```js\nconst x = 1\n```"} />
        <CopyButton value="copy me" />
        <Diagram source="graph TD; A-->B" />
        <Slides source={"# 演示\n---\n## 第二页"} />
        <CodeBlock language="html" source="<h1>预览</h1>" />
        <Attachment attachment={{ id: "f1", name: "file.txt", size: 20 }} sessionId="s1" />
        <ZoomableImage src="/image.png" alt="示例图" />
        <ImageLightbox src="/large.png" alt="大图" onClose={vi.fn()} />
        <ArtifactPreview artifact={{ id: "x", name: "note.md", kind: "code", content: "hello", source: "测试" }} />
        <ArtifactPreview artifact={{ id: "svg", name: "shape.svg", kind: "svg", content: "<svg><circle /></svg>", source: "测试" }} />
        <ArtifactPreview artifact={{ id: "mmd", name: "flow.mmd", kind: "mermaid", content: "graph TD;A-->B", source: "测试" }} />
        <ArtifactPreview artifact={{ id: "html", name: "page.html", kind: "html", content: "<h1>网页</h1>", source: "测试" }} />
        <ArtifactPreview artifact={{ id: "slides", name: "deck.md", kind: "slides", content: "# Deck\n---\nPage", source: "测试" }} />
        <ArtifactPreview artifact={{ id: "img", name: "pic.png", kind: "attachment", mimeType: "image/png", url: "/pic.png", source: "测试" }} />
      </>,
    );
    expect(screen.getByText("标题")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Next page" })[0]);
    await waitFor(() => expect(screen.getByText("diagram")).toBeInTheDocument());
    await user.click(screen.getAllByLabelText("Copy")[0]);
    for (const toggle of screen.getAllByRole("button", { name: "View Source" }).slice(0, 3))
      await user.click(toggle);
    fireEvent.doubleClick(screen.getByAltText("示例图"));
    expect(screen.getByRole("dialog", { name: /View Full Image 示例图/ })).toBeInTheDocument();
    await user.click(screen.getAllByLabelText("Close Full Image").at(-1));
    const sourceTabs = screen.queryAllByRole("tab", { name: "Source" });
    if (sourceTabs.length) await user.click(sourceTabs[0]);
    const downloads = screen.queryAllByLabelText("Download file");
    if (downloads.length) await user.click(downloads[0]);
  });

  test("loads local and remote artifact contents", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => ({
      ok: !String(url).includes("broken"),
      text: async () => "remote body",
    }));
    render(
      <>
        <ArtifactPreview artifact={{
          id: "local-attachment-1",
          name: "local.txt",
          mimeType: "text/plain",
          localDataUrl: `data:text/plain;base64,${btoa("local body")}`,
        }} />
        <ArtifactPreview artifact={{
          id: "remote",
          name: "remote.md",
          mimeType: "text/markdown",
          kind: "markdown",
          url: "/remote.md",
        }} />
        <ArtifactPreview artifact={{
          id: "binary",
          name: "archive.zip",
          mimeType: "application/zip",
          url: "/archive.zip",
        }} />
      </>,
    );
    expect(await screen.findByText("local body")).toBeInTheDocument();
    expect(await screen.findByText("remote body")).toBeInTheDocument();
    expect(screen.getByText("Download this file from the top right to view it.")).toBeInTheDocument();
    globalThis.fetch = originalFetch;
  });

  test("previews an attached HTML file in the script-only sandbox", async () => {
    const user = userEvent.setup();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: true, text: async () => "<h1>Demo</h1>" }));
    render(
      <ArtifactPreview artifact={{
        id: "demo",
        name: "sidebar-demo.html",
        kind: "attachment",
        mimeType: "text/html",
        url: "/api/assistant/attachments/demo?sessionId=s1",
      }} />,
    );
    const frame = await screen.findByTitle("HTML Artifact Preview");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("src", "/chatbot/preview.html");
    await user.click(screen.getByRole("tab", { name: "Source" }));
    expect(screen.getByText("<h1>Demo</h1>")).toBeInTheDocument();
    globalThis.fetch = originalFetch;
  });

  test("exercises common UI primitives", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const anchor = document.createElement("button");
    document.body.append(anchor);
    render(
      <>
        <IconButton label="图标按钮" onClick={close}>x</IconButton>
        <CredentialAction text="未配置 CodeBuddy API Key" />
        <Menu label="菜单" onClose={close}>
          <button role="menuitem">第一项</button>
          <button role="menuitem">第二项</button>
        </Menu>
        <Dialog title="对话框" onClose={close} footer={<button>确定</button>}>
          <input aria-label="输入" />
        </Dialog>
        <SelectMenu
          label="选项"
          value=""
          options={[
            { id: "a", label: "甲", icon: "doc", section: "常用", description: "第一项" },
            { id: "b", label: "乙", section: "其他" },
          ]}
          onSelect={close}
          onClose={close}
          anchorRef={{ current: anchor }}
          searchable
          actions={[{ id: "new", label: "新建", icon: "plus", onSelect: close }]}
          open
        />
        <SessionContextMenu x={10} y={10} anchor={anchor} activeSessionId="s1" onClose={close}>
          <button role="menuitem">会话项</button>
        </SessionContextMenu>
      </>,
    );
    await user.click(screen.getByLabelText("图标按钮"));
    const combobox = screen.getByRole("combobox");
    await user.type(combobox, "甲");
    const select = document.querySelector(".select-menu");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.keyDown(select, { key: "Home" });
    fireEvent.keyDown(select, { key: "Enter" });
    fireEvent.keyDown(document, { key: "Escape" });
    const menu = screen.getByRole("menu", { name: "菜单" });
    screen.getByRole("menuitem", { name: "第一项" }).focus();
    fireEvent.keyDown(menu, { key: "End" });
    fireEvent.keyDown(menu, { key: "Home" });
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.querySelector(".dialog-backdrop"));
    expect(close).toHaveBeenCalled();
  });

  test("closes a controlled select and runs its action row", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    function ControlledSelect() {
      const [open, setOpen] = React.useState(true);
      const anchor = React.useRef(null);
      return (
        <div className="chat-shell">
          <button ref={(node) => {
            anchor.current = node;
            if (node)
              node.getBoundingClientRect = () => ({
                top: 200, bottom: 230, left: 200, right: 300,
                width: 100, height: 30,
              });
          }}>anchor</button>
          <SelectMenu
            label="受控选项"
            value="a"
            options={[]}
            actions={[{ id: "new", label: "新建项目", icon: "plus", onSelect: action }]}
            onSelect={vi.fn()}
            onClose={() => setOpen(false)}
            anchorRef={anchor}
            open={open}
            emptyText="没有选项"
          />
        </div>
      );
    }
    render(<ControlledSelect />);
    expect(screen.getByText("没有选项")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "新建项目" }));
    expect(action).toHaveBeenCalled();
  });

  test("links an issue through the selector", async () => {
    const user = userEvent.setup();
    render(<IssueContext chat={chat} open hideTrigger onClose={vi.fn()} />);
    expect(await screen.findByText("需求一")).toBeInTheDocument();
    await user.click(screen.getByText("需求一"));
    expect(chat.linkIssue).toHaveBeenCalledWith("ISSUE-1");
  });

  test("unlinks an existing issue", async () => {
    const user = userEvent.setup();
    const existingChat = { ...chat, issueId: "ISSUE-1", linkIssue: vi.fn(async () => true) };
    render(<IssueContext chat={existingChat} open hideTrigger onClose={vi.fn()} />);
    await user.click(await screen.findByText("Unlink"));
    expect(existingChat.linkIssue).toHaveBeenCalledWith("");
  });

  test("renders side panel tabs, draft card and artifact directory", async () => {
    const user = userEvent.setup();
    const setSelected = vi.fn();
    const draft = {
      id: "d1",
      name: "保存需求",
      kind: "operation",
      draft: { tool: "issues_save", body: { projectId: "p1", title: "需求" } },
    };
    const { rerender } = render(
      <>
        <SidePanel chat={chat} tab="sop" setTab={vi.fn()} selected={null} setSelected={setSelected} onClose={vi.fn()} />
        <DraftCard artifact={draft} onApply={vi.fn(async () => ({}))} onPreview={vi.fn()} context={chat} />
      </>,
    );
    expect(await screen.findByText("流程一")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("New workflow or task"), "新任务");
    await user.click(screen.getByText("Dispatch SOP"));
    await waitFor(() => expect(writeMock).toHaveBeenCalled());
    await user.type(screen.getByPlaceholderText("New workflow or task"), "复制流程");
    await user.click(screen.getByText("Create SOP"));
    const runRow = await screen.findByRole("button", { name: /交付流程/ });
    await user.click(runRow);
    expect(await screen.findByText("完成任务")).toBeInTheDocument();

    rerender(
      <div className="chat-shell">
        <header className="conversation-header" />
        <main className="conversation-main" />
        <ArtifactPanel
          artifacts={[
            { id: "f1", name: "readme.md", kind: "code", content: "text", source: "会话" },
            { id: "sop1", name: "流程", kind: "sop", asset: { id: "wf1", status: "published" } },
            draft,
          ]}
          runs={[run]}
          selected={null}
          setSelected={setSelected}
          chat={chat}
          onClose={vi.fn()}
          open
        />
      </div>,
    );
    await user.type(screen.getByLabelText("Search artifacts"), "readme");
    await user.click(screen.getByText("readme.md"));
    expect(setSelected).toHaveBeenCalled();
    rerender(
      <div className="chat-shell">
        <header className="conversation-header" />
        <main className="conversation-main" />
        <ArtifactPanel
          artifacts={[{ id: "f1", name: "readme.md", kind: "code", content: "text", source: "会话" }]}
          runs={[run]}
          selected={{ kind: "run", id: "r1", runId: "r1", name: "交付流程" }}
          setSelected={setSelected}
          chat={chat}
          onClose={vi.fn()}
          open
        />
      </div>,
    );
    expect(screen.getByLabelText("SOP run activity")).toBeInTheDocument();
  });

  test("renders file artifacts and validates SOP actions without a project", async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    const artifactChat = {
      ...chat,
      projectId: "",
      projects: [],
      session: {
        id: "s-files",
        projectId: "",
        messages: [{
          role: "assistant",
          content: JSON.stringify({
            message: "```mermaid\ngraph LR\nA-->B\n```",
            drafts: [{ tool: "workflows_save", body: { name: "文件流程" } }],
          }),
          attachments: [{ id: "file1", name: "report.txt", mimeType: "text/plain", size: 2048 }],
        }],
      },
    };
    const { rerender } = render(
      <SidePanel
        chat={artifactChat}
        tab="files"
        setTab={vi.fn()}
        selected={null}
        setSelected={select}
        onClose={vi.fn()}
      />,
    );
    await user.click(screen.getByText("report.txt"));
    expect(select).toHaveBeenCalled();
    rerender(
      <SidePanel
        chat={artifactChat}
        tab="sop"
        setTab={vi.fn()}
        selected={null}
        setSelected={select}
        onClose={vi.fn()}
      />,
    );
    await user.type(screen.getByPlaceholderText("New workflow or task"), "任务");
    await user.click(screen.getByText("Dispatch SOP"));
    expect(screen.getByRole("alert")).toHaveTextContent("Select or link a project");
  });

  test("renders selected draft and definition previews", async () => {
    const draft = {
      id: "d2",
      name: "角色草稿",
      kind: "role",
      draft: {
        tool: "agents_save",
        body: { id: "role1", name: "评审角色", description: "负责评审", prompt: "认真检查" },
      },
    };
    const { rerender } = render(
      <SidePanel
        chat={{ ...chat, session: { ...chat.session, messages: [{ role: "assistant", content: JSON.stringify({ message: "草稿", drafts: [draft.draft] }) }] } }}
        tab="files"
        setTab={vi.fn()}
        selected={draft}
        setSelected={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("评审角色")).toBeInTheDocument();
    rerender(
      <div className="chat-shell">
        <header className="conversation-header" />
        <main className="conversation-main" />
        <ArtifactPanel
          artifacts={[draft]}
          runs={[run]}
          selected={draft}
          setSelected={vi.fn()}
          chat={chat}
          onClose={vi.fn()}
          open
        />
      </div>,
    );
    expect(screen.getAllByText("评审角色").length).toBeGreaterThan(0);
  });

  test("loads saved definitions and previews executed operations", async () => {
    apiMock.mockResolvedValueOnce({
      id: "wf-saved",
      name: "已保存流程",
      description: "流程说明",
      status: "published",
      nodes: [{ id: "n1", name: "实现", type: "agent" }],
    });
    const { rerender } = render(
      <div className="chat-shell">
        <header className="conversation-header" />
        <main className="conversation-main" />
        <ArtifactPanel
          artifacts={[]}
          runs={[run]}
          selected={{ id: "saved-sop", kind: "sop", name: "流程", asset: { id: "wf-saved" } }}
          setSelected={vi.fn()}
          chat={chat}
          onClose={vi.fn()}
          open
        />
      </div>,
    );
    expect(await screen.findByText("已保存流程")).toBeInTheDocument();
    rerender(
      <div className="chat-shell">
        <header className="conversation-header" />
        <main className="conversation-main" />
        <ArtifactPanel
          artifacts={[]}
          runs={[run]}
          selected={{
            id: "operation1",
            kind: "operation",
            name: "执行结果",
            draft: { tool: "runs_start", saved: true, savedResult: { data: { runId: "r1" } }, body: {} },
          }}
          setSelected={vi.fn()}
          chat={chat}
          onClose={vi.fn()}
          open
        />
      </div>,
    );
    expect(screen.getByLabelText("Conversation artifacts")).toBeInTheDocument();
  });

  test("loads repository choices and applies an import draft", async () => {
    const user = userEvent.setup();
    apiMock.mockResolvedValueOnce([
      { id: "repo1", name: "仓库一", projectId: "p1" },
      { id: "repo2", name: "仓库二", projectId: "p1" },
    ]);
    const apply = vi.fn(async () => ({}));
    render(
      <DraftCard
        artifact={{
          id: "import1",
          messageIndex: 1,
          draftIndex: 0,
          name: "导入 TAPD 需求",
          kind: "operation",
          draft: {
            tool: "issues_import_tapd",
            body: { projectId: "p1", workspaceId: "tapd", repositoryIds: [] },
            warnings: ["导入前请检查"],
          },
        }}
        onApply={apply}
        onPreview={vi.fn()}
        context={{ projectId: "p1", projects: chat.projects, references: [] }}
      />,
    );
    await user.click(await screen.findByLabelText("仓库一"));
    const confirm = screen.queryByRole("button", { name: /^Approve/ });
    if (confirm && !confirm.disabled) await user.click(confirm);
    expect(screen.getByText("导入前请检查")).toBeInTheDocument();
  });

  test("an SOP proposal is declined or muted from its card", async () => {
    const user = userEvent.setup();
    const decide = vi.fn(async () => ({}));
    const artifact = (draft) => ({
      id: "sop2",
      messageIndex: 3,
      draftIndex: 0,
      name: "积分排行榜",
      kind: "operation",
      draft: {
        tool: "issues_save",
        body: { projectId: "p1", title: "积分排行榜", kind: "requirement", workflowId: "delivery" },
        proposal: { reason: "后续可以走 SOP 完整交付", timing: "end" },
        ...draft,
      },
    });
    const context = { projectId: "p1", projects: chat.projects, references: [] };
    const { rerender } = render(
      <DraftCard artifact={artifact({})} onApply={vi.fn()} onDecide={decide} onPreview={vi.fn()} context={context} />,
    );
    expect(screen.getByText(/Possible next steps: 后续可以走 SOP/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "No thanks" }));
    expect(decide).toHaveBeenLastCalledWith(3, 0, "declined");
    await user.click(screen.getByRole("button", { name: "Stop suggesting in this conversation" }));
    expect(decide).toHaveBeenLastCalledWith(3, 0, "muted");

    rerender(
      <DraftCard
        artifact={artifact({ proposal: { reason: "整件需求走 SOP", timing: "start" } })}
        onApply={vi.fn()}
        onDecide={decide}
        onPreview={vi.fn()}
        context={context}
      />,
    );
    expect(screen.getByRole("button", { name: "Let the assistant handle it" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();

    const expiresAt = new Date(Date.now() + 125_000).toISOString();
    rerender(
      <DraftCard
        artifact={artifact({ proposal: { reason: "整件需求走 SOP", timing: "start", expiresAt } })}
        onApply={vi.fn()}
        onDecide={decide}
        onPreview={vi.fn()}
        context={context}
      />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent(/^2:0[45] until the assistant proceeds automatically$/);

    rerender(
      <DraftCard
        artifact={artifact({
          proposal: { reason: "整件需求走 SOP", timing: "start", expiresAt: new Date(Date.now() - 1000).toISOString() },
        })}
        onApply={vi.fn()}
        onDecide={decide}
        onPreview={vi.fn()}
        context={context}
      />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("Timed out. The assistant will proceed automatically.");

    rerender(
      <DraftCard
        artifact={artifact({ proposal: { reason: "整件需求走 SOP", timing: "start", expiresAt }, decision: "expired" })}
        onApply={vi.fn()}
        onDecide={decide}
        onPreview={vi.fn()}
        context={context}
      />,
    );
    expect(screen.getByRole("button", { name: "Timed out. The assistant proceeded automatically." })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Create requirement and run SOP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Let the assistant handle it" })).not.toBeInTheDocument();

    rerender(
      <DraftCard artifact={artifact({ decision: "declined" })} onApply={vi.fn()} onDecide={decide} onPreview={vi.fn()} context={context} />,
    );
    expect(screen.getByText(/Declined/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create requirement and run SOP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop suggesting in this conversation" })).not.toBeInTheDocument();
  });

  test("an SOP proposal card names the SOP route", async () => {
    const user = userEvent.setup();
    const apply = vi.fn(async () => ({}));
    const decide = vi.fn(async () => ({}));
    render(
      <DraftCard
        artifact={{
          id: "sop1",
          messageIndex: 1,
          draftIndex: 0,
          name: "积分排行榜",
          kind: "operation",
          draft: {
            tool: "issues_save",
            body: { projectId: "p1", title: "积分排行榜", kind: "requirement", workflowId: "delivery" },
            proposal: { reason: "新功能，SOP 用途对得上", timing: "start" },
          },
        }}
        onApply={apply}
        onDecide={decide}
        onPreview={vi.fn()}
        context={{ projectId: "p1", projects: [{ id: "p1", name: "项目一" }], references: [] }}
      />,
    );
    expect(screen.getByText(/Use an SOP for this task: 新功能/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create requirement and run SOP" }));
    expect(apply).toHaveBeenCalledWith(1, 0, expect.anything());
    await user.click(screen.getByRole("button", { name: "Let the assistant handle it" }));
    expect(decide).toHaveBeenLastCalledWith(1, 0, "declined");
  });

  test("opens SOP node conversation and its artifacts", async () => {
    const user = userEvent.setup();
    render(<SopRunPanel runs={[run]} onClose={vi.fn()} />);
    await user.click(screen.getByText("实现"));
    expect(await screen.findByText("Conversation activity")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Artifacts/ }));
    await user.click(screen.getByText("result.md"));
    expect(screen.getByText("Back to step artifacts")).toBeInTheDocument();
  });

  test("switches among runs and renders mixed node statuses", async () => {
    const user = userEvent.setup();
    const mixed = {
      id: "r2",
      status: "running",
      input: "执行混合流程",
      workflowSnapshot: {
        name: "混合流程",
        nodes: [
          { id: "done", name: "已完成节点", type: "agent" },
          { id: "active", name: "运行节点", type: "agent" },
          { id: "pending", name: "待执行节点", type: "agent" },
        ],
      },
      nodes: {
        done: { nodeId: "done", status: "succeeded", output: "完成输出" },
        active: { nodeId: "active", status: "running", activity: "处理中" },
      },
      artifacts: [],
    };
    render(<SopRunPanel runs={[run, mixed]} onClose={vi.fn()} embedded />);
    await user.click(screen.getByLabelText(/^Select a conversation run: /));
    await user.click(screen.getByRole("option", { name: "混合流程" }));
    expect(screen.getAllByText("混合流程").length).toBeGreaterThan(0);
    expect(screen.getByText("Pending")).toBeInTheDocument();
    await user.click(screen.getByText("运行节点"));
    expect(await screen.findByText("执行混合流程")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Artifacts/ }));
    expect(screen.getByText("This step has no artifacts yet.")).toBeInTheDocument();
  });

  test("shows and operates a failed run alert", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    render(
      <RunAlerts
        runs={[run]}
        user={{ id: 1 }}
        users={[]}
        readOnly={false}
        onOpenNode={vi.fn()}
        onAsk={onAsk}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByText(/Execution failed/)).toBeInTheDocument();
    await user.click(screen.getByText("Retry step"));
    await user.click(screen.getByText("Ask AI to analyze"));
    expect(onAsk).toHaveBeenCalled();
  });

  test("a CodeBuddy key alert links to the key page of the owner's network environment", () => {
    const { unmount } = render(
      <RunAlerts
        runs={[run]}
        user={{ id: 1 }}
        users={[{ id: 1, codeBuddyInternetEnvironment: "internal" }]}
        readOnly={false}
        onOpenNode={vi.fn()}
        onAsk={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /ChinaCreate key/ })).toHaveAttribute(
      "href",
      "https://copilot.tencent.com/profile/",
    );
    unmount();
    render(
      <RunAlerts
        runs={[{ ...run, executionContext: { responsibleUserId: 2 } }]}
        user={{ id: 1, codeBuddyInternetEnvironment: "internal" }}
        users={[{ id: 2, loginName: "owner", codeBuddyInternetEnvironment: "ioa" }]}
        readOnly={false}
        onOpenNode={vi.fn()}
        onAsk={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /iOACreate key/ })).toHaveAttribute(
      "href",
      "https://tencent.sso.copilot.tencent.com/profile/keys",
    );
  });

  test("renders a waiting approval alert", () => {
    render(
      <RunAlerts
        runs={[{ ...run, status: "waiting", nodes: { n1: { nodeId: "n1", status: "waiting_approval" } } }]}
        user={{ id: 1 }}
        users={[]}
        readOnly
        onOpenNode={vi.fn()}
        onAsk={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/Awaiting human approval/).length).toBeGreaterThan(0);
    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  test("lists a submitted merge request in the artifact panel and opens it on 工蜂", () => {
    const mr = {
      id: "mr-example/agent-flow/631",
      name: "agent-flow !631",
      kind: "merge-request",
      url: "https://git.example.com/example/agent-flow/merge_requests/631",
      external: true,
      source: "MR · example/agent-flow",
    };
    render(
      <div className="chat-shell">
        <header className="conversation-header" />
        <main className="conversation-main" />
        <ArtifactPanel
          artifacts={[mr]}
          runs={[]}
          selected={null}
          setSelected={vi.fn()}
          chat={chat}
          onClose={vi.fn()}
          open
        />
      </div>,
    );
    expect(screen.getByText("Merge request")).toBeInTheDocument();
    const link = screen.getByTitle("agent-flow !631 · Open in repository");
    expect(link.getAttribute("href")).toBe(mr.url);
    expect(link.getAttribute("target")).toBe("_blank");
  });

});
