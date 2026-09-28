import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import EmptyState, {
  GoalsEmptyState,
  GroupsEmptyState,
  DepositsEmptyState,
  LockedSavingsEmptyState,
  HarvestHistoryEmptyState,
  SavingsListEmptyState,
} from "./EmptyState";

describe("EmptyState", () => {
  it("renders title, description, and primary CTA", () => {
    const handleAction = jest.fn();
    render(
      <EmptyState
        title="Nothing to see here"
        description="Try adding your first item to get started."
        action={{
          label: "Get Started",
          onClick: handleAction,
        }}
      />
    );

    expect(screen.getByTestId("empty-state-title")).toHaveTextContent(
      "Nothing to see here"
    );
    expect(screen.getByTestId("empty-state-description")).toHaveTextContent(
      "Try adding your first item to get started."
    );

    const ctaButton = screen.getByTestId("empty-state-cta");
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveTextContent("Get Started");

    fireEvent.click(ctaButton);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });

  it("renders a Link when action has href and no custom onClick", () => {
    render(
      <EmptyState
        title="Explore"
        description="Check out more details."
        action={{
          label: "View Documentation",
          href: "/docs",
        }}
      />
    );

    const link = screen.getByTestId("empty-state-cta");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/docs");
    expect(link).toHaveTextContent("View Documentation");
  });

  describe("Savings lists empty states", () => {
    it("renders GoalsEmptyState with primary CTA", () => {
      const handleCreateGoal = jest.fn();
      render(<GoalsEmptyState onAction={handleCreateGoal} />);

      expect(screen.getByTestId("goals-empty-state-title")).toHaveTextContent(
        "No savings goals yet"
      );
      expect(
        screen.getByTestId("goals-empty-state-description")
      ).toHaveTextContent(
        "Set a target, save at your own pace, and reach your milestones faster."
      );

      const cta = screen.getByTestId("goals-empty-state-cta");
      expect(cta).toHaveTextContent("Create a goal");
      fireEvent.click(cta);
      expect(handleCreateGoal).toHaveBeenCalledTimes(1);
    });

    it("renders GroupsEmptyState with primary CTA", () => {
      const handleCreateGroup = jest.fn();
      render(<GroupsEmptyState onAction={handleCreateGroup} />);

      expect(screen.getByTestId("groups-empty-state-title")).toHaveTextContent(
        "No savings groups yet"
      );
      expect(
        screen.getByTestId("groups-empty-state-description")
      ).toHaveTextContent(
        "Save together with friends, family, or colleagues toward collective savings pools."
      );

      const cta = screen.getByTestId("groups-empty-state-cta");
      expect(cta).toHaveTextContent("Create a group");
      fireEvent.click(cta);
      expect(handleCreateGroup).toHaveBeenCalledTimes(1);
    });

    it("renders DepositsEmptyState with primary CTA", () => {
      const handleDeposit = jest.fn();
      render(<DepositsEmptyState onAction={handleDeposit} />);

      expect(screen.getByTestId("deposits-empty-state-title")).toHaveTextContent(
        "No deposits yet"
      );
      expect(
        screen.getByTestId("deposits-empty-state-description")
      ).toHaveTextContent(
        "Deposit USDC into your savings vault to start earning flexible yield immediately."
      );

      const cta = screen.getByTestId("deposits-empty-state-cta");
      expect(cta).toHaveTextContent("Make a deposit");
      fireEvent.click(cta);
      expect(handleDeposit).toHaveBeenCalledTimes(1);
    });

    it("renders LockedSavingsEmptyState with primary CTA", () => {
      const handleLock = jest.fn();
      render(<LockedSavingsEmptyState onAction={handleLock} />);

      expect(
        screen.getByTestId("locked-savings-empty-state-title")
      ).toHaveTextContent("No locked plans yet");

      const cta = screen.getByTestId("locked-savings-empty-state-cta");
      expect(cta).toHaveTextContent("Create locked plan");
      fireEvent.click(cta);
      expect(handleLock).toHaveBeenCalledTimes(1);
    });

    it("renders HarvestHistoryEmptyState with primary CTA", () => {
      const handleHarvest = jest.fn();
      render(<HarvestHistoryEmptyState onAction={handleHarvest} />);

      expect(
        screen.getByTestId("harvest-history-empty-state-title")
      ).toHaveTextContent("No harvest history yet");

      const cta = screen.getByTestId("harvest-history-empty-state-cta");
      expect(cta).toHaveTextContent("Explore yield");
      fireEvent.click(cta);
      expect(handleHarvest).toHaveBeenCalledTimes(1);
    });
  });

  describe("SavingsListEmptyState polymorphic switcher", () => {
    it.each([
      ["goals", "goals-empty-state"],
      ["groups", "groups-empty-state"],
      ["deposits", "deposits-empty-state"],
      ["locked", "locked-savings-empty-state"],
      ["harvest", "harvest-history-empty-state"],
    ] as const)("renders the appropriate empty state for %s", (type, testId) => {
      render(<SavingsListEmptyState type={type} />);
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    });

    it("guides user toward first action on empty list response simulation", () => {
      // Simulate an empty list response from API (e.g. goals: [])
      const emptyGoalsResponse: any[] = [];
      const onFirstAction = jest.fn();

      const { rerender } = render(
        <div>
          {emptyGoalsResponse.length === 0 ? (
            <SavingsListEmptyState type="goals" onAction={onFirstAction} />
          ) : (
            <ul>
              {emptyGoalsResponse.map((g, i) => (
                <li key={i}>{g.name}</li>
              ))}
            </ul>
          )}
        </div>
      );

      expect(screen.getByTestId("goals-empty-state")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("goals-empty-state-cta"));
      expect(onFirstAction).toHaveBeenCalledTimes(1);

      // Verify that when items exist, empty state is not displayed
      rerender(
        <div>
          {[{ name: "Vacation Fund" }].length === 0 ? (
            <SavingsListEmptyState type="goals" onAction={onFirstAction} />
          ) : (
            <ul>
              <li>Vacation Fund</li>
            </ul>
          )}
        </div>
      );
      expect(screen.queryByTestId("goals-empty-state")).not.toBeInTheDocument();
      expect(screen.getByText("Vacation Fund")).toBeInTheDocument();
    });
  });
});
