import React from "react";
import Link from "next/link";
import {
  Target,
  Users,
  ArrowDownToLine,
  Lock,
  Sprout,
  Inbox,
  LucideIcon,
} from "lucide-react";

export interface EmptyStateAction {
  label: string;
  onClick?: () => void;
  href?: string;
  className?: string;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: EmptyStateAction;
  className?: string;
  testId?: string;
}

/**
 * Generic empty-state placeholder with title, description, and primary CTA.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
  testId = "empty-state",
}: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label={title}
      data-testid={testId}
      className={`flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-8 text-center sm:p-12 ${className}`}
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-brand"
        aria-hidden="true"
        data-testid={`${testId}-icon`}
      >
        {icon ?? <Inbox className="h-7 w-7" />}
      </div>

      <h3
        data-testid={`${testId}-title`}
        className="mb-2 text-xl font-semibold text-foreground"
      >
        {title}
      </h3>

      <p
        data-testid={`${testId}-description`}
        className="mb-6 max-w-sm text-sm text-muted"
      >
        {description}
      </p>

      {action && (
        action.href ? (
          <Link
            href={action.href}
            onClick={action.onClick}
            data-testid={`${testId}-cta`}
            className={`inline-flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand/50 ${
              action.className ?? ""
            }`}
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            data-testid={`${testId}-cta`}
            className={`inline-flex items-center justify-center rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90 focus:outline-none focus:ring-2 focus:ring-brand/50 ${
              action.className ?? ""
            }`}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Savings list specific empty states with tailored CTAs
// ---------------------------------------------------------------------------

export interface SavingsEmptyStateProps {
  onAction?: () => void;
  href?: string;
  className?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
}

/** Empty state for personal savings goals list. */
export function GoalsEmptyState({
  onAction,
  href = "/savings/goals/new",
  className = "",
  title = "No savings goals yet",
  description = "Set a target, save at your own pace, and reach your milestones faster.",
  actionLabel = "Create a goal",
}: SavingsEmptyStateProps) {
  return (
    <EmptyState
      icon={<Target className="h-7 w-7 text-brand" />}
      title={title}
      description={description}
      action={{
        label: actionLabel,
        onClick: onAction,
        href: onAction ? undefined : href,
      }}
      className={className}
      testId="goals-empty-state"
    />
  );
}

/** Empty state for collective savings groups list. */
export function GroupsEmptyState({
  onAction,
  href = "/savings/groups/new",
  className = "",
  title = "No savings groups yet",
  description = "Save together with friends, family, or colleagues toward collective savings pools.",
  actionLabel = "Create a group",
}: SavingsEmptyStateProps) {
  return (
    <EmptyState
      icon={<Users className="h-7 w-7 text-brand" />}
      title={title}
      description={description}
      action={{
        label: actionLabel,
        onClick: onAction,
        href: onAction ? undefined : href,
      }}
      className={className}
      testId="groups-empty-state"
    />
  );
}

/** Empty state for flexible vault deposits list. */
export function DepositsEmptyState({
  onAction,
  href = "/ramps/deposit",
  className = "",
  title = "No deposits yet",
  description = "Deposit USDC into your savings vault to start earning flexible yield immediately.",
  actionLabel = "Make a deposit",
}: SavingsEmptyStateProps) {
  return (
    <EmptyState
      icon={<ArrowDownToLine className="h-7 w-7 text-brand" />}
      title={title}
      description={description}
      action={{
        label: actionLabel,
        onClick: onAction,
        href: onAction ? undefined : href,
      }}
      className={className}
      testId="deposits-empty-state"
    />
  );
}

/** Empty state for locked savings plans list. */
export function LockedSavingsEmptyState({
  onAction,
  href,
  className = "",
  title = "No locked plans yet",
  description = "Lock savings for fixed periods to build financial discipline and earn predictable rewards.",
  actionLabel = "Create locked plan",
}: SavingsEmptyStateProps) {
  return (
    <EmptyState
      icon={<Lock className="h-7 w-7 text-brand" />}
      title={title}
      description={description}
      action={{
        label: actionLabel,
        onClick: onAction,
        href: onAction ? undefined : href,
      }}
      className={className}
      testId="locked-savings-empty-state"
    />
  );
}

/** Empty state for harvest and yield events list. */
export function HarvestHistoryEmptyState({
  onAction,
  href,
  className = "",
  title = "No harvest history yet",
  description = "Strategy harvests and accrued yield distributions will be recorded here.",
  actionLabel = "Explore yield",
}: SavingsEmptyStateProps) {
  return (
    <EmptyState
      icon={<Sprout className="h-7 w-7 text-brand" />}
      title={title}
      description={description}
      action={{
        label: actionLabel,
        onClick: onAction,
        href: onAction ? undefined : href,
      }}
      className={className}
      testId="harvest-history-empty-state"
    />
  );
}

export type SavingsListType =
  | "goals"
  | "groups"
  | "deposits"
  | "locked"
  | "harvest";

export interface SavingsListEmptyStateProps {
  type: SavingsListType;
  onAction?: () => void;
  href?: string;
  className?: string;
}

/**
 * Unified empty-state selector for any savings list type.
 */
export function SavingsListEmptyState({
  type,
  onAction,
  href,
  className = "",
}: SavingsListEmptyStateProps) {
  switch (type) {
    case "goals":
      return <GoalsEmptyState onAction={onAction} href={href} className={className} />;
    case "groups":
      return <GroupsEmptyState onAction={onAction} href={href} className={className} />;
    case "deposits":
      return <DepositsEmptyState onAction={onAction} href={href} className={className} />;
    case "locked":
      return <LockedSavingsEmptyState onAction={onAction} href={href} className={className} />;
    case "harvest":
      return <HarvestHistoryEmptyState onAction={onAction} href={href} className={className} />;
    default:
      return null;
  }
}

export default EmptyState;
