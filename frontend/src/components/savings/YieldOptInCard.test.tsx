import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import YieldOptInCard from "./YieldOptInCard";
import { expectNoSeriousViolations } from "@/test/axe";

describe("YieldOptInCard", () => {
  it("renders with title and APR information", () => {
    render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText("Earn Yield")).toBeInTheDocument();
    expect(screen.getByText("5.5%")).toBeInTheDocument();
  });

  it("calls onToggle when button is clicked", () => {
    const onToggle = vi.fn();
    render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={onToggle} />
    );
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("has correct aria-pressed state when enabled", () => {
    render(
      <YieldOptInCard apr={5.5} isEnabled={true} onToggle={vi.fn()} />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("has correct aria-pressed state when disabled", () => {
    render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={vi.fn()} />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("disables button during loading", () => {
    const onToggle = vi.fn();
    render(
      <YieldOptInCard
        apr={5.5}
        isEnabled={false}
        onToggle={onToggle}
        isLoading={true}
      />
    );
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows loading status message", () => {
    render(
      <YieldOptInCard
        apr={5.5}
        isEnabled={false}
        onToggle={vi.fn()}
        isLoading={true}
      />
    );
    expect(screen.getByText("Updating...")).toBeInTheDocument();
  });
});

describe("YieldOptInCard accessibility", () => {
  it("reports no serious axe violations", async () => {
    const { container } = render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={vi.fn()} />
    );
    await expectNoSeriousViolations(container);
  });

  it("has a single h2 heading", () => {
    render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={vi.fn()} />
    );
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(1);
  });

  it("toggle button has accessible labels", () => {
    render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={vi.fn()} />
    );
    const button = screen.getByRole("button");
    expect(button).toHaveAccessibleName();
  });

  it("APR value has accessible label", () => {
    render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={vi.fn()} />
    );
    expect(screen.getByLabelText("5.5 percent APR")).toBeInTheDocument();
  });

  it("status message is announced to screen readers", () => {
    render(
      <YieldOptInCard
        apr={5.5}
        isEnabled={false}
        onToggle={vi.fn()}
        isLoading={true}
      />
    );
    const status = screen.getByText("Updating...");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("has landmark article role", () => {
    render(
      <YieldOptInCard apr={5.5} isEnabled={false} onToggle={vi.fn()} />
    );
    expect(screen.getByRole("article")).toBeInTheDocument();
  });
});
