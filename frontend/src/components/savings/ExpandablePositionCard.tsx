"use client";

import { useState } from "react";
import PositionCard, { type PositionCardProps } from "./PositionCard";
import StrategyInfo, { type StrategyInfoProps } from "./StrategyInfo";

export interface ExpandablePositionCardProps extends PositionCardProps {
  /** Strategy information to display when expanded */
  strategy?: StrategyInfoProps;
}

export default function ExpandablePositionCard({
  position,
  formattedValue,
  strategy,
}: ExpandablePositionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!strategy) {
    return <PositionCard position={position} formattedValue={formattedValue} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <PositionCard position={position} formattedValue={formattedValue} />
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-label={
            isExpanded ? "Hide strategy details" : "Show strategy details"
          }
          className="ml-2 rounded px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10 transition-colors"
        >
          {isExpanded ? "−" : "+"}
        </button>
      </div>

      {isExpanded && (
        <div
          role="region"
          aria-label="Strategy details"
          aria-live="polite"
          className="rounded-lg border border-border bg-card p-4"
        >
          <StrategyInfo
            strategyName={strategy.strategyName}
            activatedAt={strategy.activatedAt}
            isLoading={strategy.isLoading}
            error={strategy.error}
          />
        </div>
      )}
    </div>
  );
}
