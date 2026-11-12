import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWidth } from "@/lib/useWidth";

function Probe() {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  return <div ref={ref}>width {width}</div>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useWidth", () => {
  it("starts at the fallback and follows the element's measured width", () => {
    let report: (w: number) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: (entries: { contentRect: { width: number } }[]) => void) {
          report = (w) => cb([{ contentRect: { width: w } }]);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const { unmount } = render(<Probe />);
    expect(screen.getByText("width 640")).toBeInTheDocument();
    act(() => report(512.6));
    expect(screen.getByText("width 513")).toBeInTheDocument();
    // A zero width (element hidden) keeps the last good width rather than collapsing the chart.
    act(() => report(0));
    expect(screen.getByText("width 513")).toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("keeps the fallback where ResizeObserver doesn't exist", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    render(<Probe />);
    expect(screen.getByText("width 640")).toBeInTheDocument();
  });
});
