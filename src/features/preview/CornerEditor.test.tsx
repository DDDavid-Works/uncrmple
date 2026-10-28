import { fireEvent, render, screen } from "@testing-library/react";
import type { Quad } from "../../types/repair";
import { CornerEditor } from "./CornerEditor";

const INITIAL: Quad = [{ x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 1900 }, { x: 100, y: 1900 }];

function setup() {
  const onApply = vi.fn();
  render(
    <CornerEditor imageUrl="blob:t/1" imageAlt="Original photo" width={1000} height={2000} initial={INITIAL} onApply={onApply} onCancel={vi.fn()} />,
  );
  // Overlay drawn at half size: 1 screen px = 2 image px.
  const svg = screen.getByRole("group", { name: "Page corners" });
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) });
  return { onApply, handle: screen.getByRole("slider", { name: "Top left corner" }) };
}

describe("CornerEditor dragging", () => {
  it("moves the handle with the pointer without jumping it to the pointer", () => {
    const { onApply, handle } = setup();
    // Take hold 5 screen px (10 image px) right of the handle's centre, then drag 20 px right and 10 down.
    fireEvent.pointerDown(handle, { clientX: 55, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 75, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Apply corners" }));
    expect(onApply.mock.calls[0]![0][0]).toEqual({ x: 140, y: 120 });
  });

  it("ignores pointer movement after the drag ends", () => {
    const { onApply, handle } = setup();
    fireEvent.pointerDown(handle, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Apply corners" }));
    expect(onApply.mock.calls[0]![0][0]).toEqual({ x: 100, y: 100 });
  });
});
