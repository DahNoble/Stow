import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useReveal } from "./useReveal";

let observerInstances: MockIntersectionObserver[] = [];

class MockIntersectionObserver implements IntersectionObserver {
  callback: IntersectionObserverCallback;
  root = null;
  rootMargin = "";
  thresholds: number[] = [];
  observedElements: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    observerInstances.push(this);
  }

  observe(element: Element) {
    this.observedElements.push(element);
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function TestComponent() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="target" className={revealed ? "animate-rise" : ""}>
      {revealed ? "revealed" : "hidden"}
    </div>
  );
}

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  } satisfies MediaQueryList);
}

describe("useReveal", () => {
  const originalIntersectionObserver = global.IntersectionObserver;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    observerInstances = [];
    global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    global.IntersectionObserver = originalIntersectionObserver;
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("starts unrevealed and has no reveal class", () => {
    mockMatchMedia(false);
    render(<TestComponent />);
    expect(screen.getByTestId("target")).toHaveTextContent("hidden");
    expect(screen.getByTestId("target")).not.toHaveClass("animate-rise");
  });

  it("toggles the reveal class once the element intersects", () => {
    mockMatchMedia(false);
    render(<TestComponent />);

    expect(observerInstances).toHaveLength(1);
    act(() => {
      observerInstances[0].trigger(true);
    });

    expect(screen.getByTestId("target")).toHaveTextContent("revealed");
    expect(screen.getByTestId("target")).toHaveClass("animate-rise");
  });

  it("stays unrevealed while not intersecting", () => {
    mockMatchMedia(false);
    render(<TestComponent />);

    act(() => {
      observerInstances[0].trigger(false);
    });

    expect(screen.getByTestId("target")).toHaveTextContent("hidden");
  });

  it("reveals immediately and skips the observer when prefers-reduced-motion is set", () => {
    mockMatchMedia(true);
    render(<TestComponent />);

    expect(screen.getByTestId("target")).toHaveTextContent("revealed");
    expect(observerInstances).toHaveLength(0);
  });
});
