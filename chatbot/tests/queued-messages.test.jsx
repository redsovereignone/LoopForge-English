import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import QueuedMessages from "../src/QueuedMessages.jsx";

const items = [
  { id: "q1", text: "先看 CI" },
  { id: "q2", text: "然后整理结论" },
];

describe("QueuedMessages", () => {
  test("steer interrupts the running reply with the chosen message", () => {
    const onSendNow = vi.fn();
    render(<QueuedMessages items={items} busy onSendNow={onSendNow} />);
    const buttons = screen.getAllByRole("button", { name: "Steer" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0].title).toBe("Interrupt the reply and send this message now");
    fireEvent.click(buttons[1]);
    expect(onSendNow).toHaveBeenCalledWith("q2");
  });

  test("rows carry no header, only the message and its actions", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <QueuedMessages items={items} busy onEdit={onEdit} onRemove={onRemove} />,
    );
    expect(container.querySelector(".queued-messages-note")).toBeNull();
    expect(container.textContent).not.toContain("Queued");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit message" })[0]);
    expect(onEdit).toHaveBeenCalledWith(items[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    expect(onRemove).toHaveBeenCalledWith("q2");
  });

  test("shows the message being sent and blocks a second interrupt", () => {
    const { container } = render(
      <QueuedMessages items={[items[1]]} steering={items[0]} busy onSendNow={() => {}} />,
    );
    expect(container.querySelector(".is-steering")?.textContent).toBe("先看 CISteering");
    expect(screen.getByRole("button", { name: "Steer" }).disabled).toBe(true);
  });

  test("rows keep the steer label while the interrupted turn hands over", () => {
    render(<QueuedMessages items={[items[1]]} steering={items[0]} held onSendNow={() => {}} />);
    expect(screen.getByRole("button", { name: "Steer" }).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  });

  test("only the message being sent: no paused note and no stray 0", () => {
    const { container } = render(<QueuedMessages items={[]} steering={items[0]} held busy />);
    expect(container.querySelector(".queued-messages-note")).toBeNull();
    expect(container.textContent).toBe("先看 CISteering");
  });

  test("held queue without a running reply sends directly and can resume", () => {
    const onResume = vi.fn();
    render(<QueuedMessages items={[items[0]]} held onSendNow={() => {}} onResume={onResume} />);
    expect(screen.getByRole("status").textContent).toContain("Automatic sending paused");
    expect(screen.getByRole("button", { name: "Send" }).title).toBe("Send this message now");
    fireEvent.click(screen.getByRole("button", { name: "Resume sending" }));
    expect(onResume).toHaveBeenCalled();
  });

  test("read-only conversations have no actions", () => {
    render(<QueuedMessages items={items} busy readOnly onSendNow={() => {}} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
