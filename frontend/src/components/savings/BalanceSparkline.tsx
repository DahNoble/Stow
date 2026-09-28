"use client";

import { useMemo } from "react";

export interface BalanceDataPoint {
  timestamp: number;
  balance: number;
  /** Cumulative principal (deposits minus withdrawals) at this point in time. */
  principal?: number;
  /** Cumulative yield (harvest-driven growth) at this point in time. */
  yield?: number;
}

export interface BalanceSparklineProps {
  data: BalanceDataPoint[];
  width?: number;
  height?: number;
  className?: string;
  ariaLabel?: string;
  /**
   * When true (default) and principal/yield are provided, the chart renders
   * stacked principal and yield series so deposits/withdrawals are visually
   * distinguished from harvest-driven growth.
   */
  showYieldBreakdown?: boolean;
}

/**
 * A small balance trend chart component that shows balance over time.
 * Handles sparse data gracefully and provides accessible summary text.
 *
 * When `principal`/`yield` are supplied on the data points, the chart splits
 * the balance into a stacked principal area and a yield area so users can see
 * how much growth came from yield versus deposits.
 */
export default function BalanceSparkline({
  data,
  width = 120,
  height = 40,
  className = "",
  ariaLabel,
  showYieldBreakdown = true,
}: BalanceSparklineProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        points: [],
        pathData: "",
        principalPathData: "",
        yieldPathData: "",
        hasBreakdown: false,
        minBalance: 0,
        maxBalance: 0,
        trend: "flat",
        summary: "No balance data available",
      };
    }

    // Sort data by timestamp to handle sparse/unordered data
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);

    // Only render the stacked breakdown when every point carries principal/yield.
    const hasBreakdown =
      showYieldBreakdown &&
      sortedData.every(
        (d) => typeof d.principal === "number" && typeof d.yield === "number"
      );

    const minBalance = Math.min(...sortedData.map(d => d.balance));
    const maxBalance = Math.max(...sortedData.map(d => d.balance));
    const range = maxBalance - minBalance;

    // Handle flat data (all same values)
    const isFlat = range === 0;

    const toY = (value: number) =>
      isFlat ? height / 2 : height - ((value - minBalance) / range) * height;

    // Calculate SVG points
    const points = sortedData.map((point, index) => {
      const x = (index / Math.max(sortedData.length - 1, 1)) * width;
      const y = toY(point.balance);
      return {
        x,
        y,
        balance: point.balance,
        principal: point.principal,
        yield: point.yield,
      };
    });

    // Generate SVG path
    const pathData = points.length > 0
      ? `M ${points[0].x} ${points[0].y} ` +
        points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ")
      : "";

    // Stacked series: principal area (baseline -> principal) and yield area
    // (principal -> balance). Distinct fills visually separate deposits from
    // harvest-driven growth.
    let principalPathData = "";
    let yieldPathData = "";
    if (hasBreakdown && points.length > 0) {
      const principalTop = points.map((p) => ({ x: p.x, y: toY(p.principal as number) }));
      const baselineY = toY(minBalance);

      principalPathData =
        `M ${principalTop[0].x} ${baselineY} ` +
        principalTop.map((p) => `L ${p.x} ${p.y}`).join(" ") +
        ` L ${principalTop[principalTop.length - 1].x} ${baselineY} Z`;

      yieldPathData =
        `M ${principalTop[0].x} ${principalTop[0].y} ` +
        points.map((p, i) => `L ${p.x} ${i === 0 ? principalTop[0].y : p.y}`).join(" ") +
        ` ` +
        [...principalTop].reverse().map((p) => `L ${p.x} ${p.y}`).join(" ") +
        " Z";
    }

    // Determine trend
    let trend: "up" | "down" | "flat" = "flat";
    if (sortedData.length >= 2) {
      const first = sortedData[0].balance;
      const last = sortedData[sortedData.length - 1].balance;
      if (last > first) trend = "up";
      else if (last < first) trend = "down";
    }

    // Generate accessible summary
    const formatBalance = (balance: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
      }).formatToParts(balance).map(part =>
        part.type === 'currency' ? '$' : part.value
      ).join('');

    let summary = "";
    if (sortedData.length === 1) {
      summary = `Balance: ${formatBalance(sortedData[0].balance)}`;
    } else if (sortedData.length >= 2) {
      const first = sortedData[0].balance;
      const last = sortedData[sortedData.length - 1].balance;
      const change = Math.abs(last - first);
      const changePercent = first > 0 ? ((last - first) / first * 100).toFixed(1) : "0";

      summary = `Balance trend over ${sortedData.length} data points: ` +
        `from ${formatBalance(first)} to ${formatBalance(last)}`;

      if (trend !== "flat") {
        summary += `, ${trend === "up" ? "increased" : "decreased"} by ` +
          `${formatBalance(change)} (${Math.abs(parseFloat(changePercent))}%)`;
      }
    }

    if (hasBreakdown) {
      const lastPoint = sortedData[sortedData.length - 1];
      const principal = lastPoint.principal as number;
      const yieldAmount = lastPoint.yield as number;
      summary += `. Principal ${formatBalance(principal)}, yield ${formatBalance(yieldAmount)}`;
    }

    return {
      points,
      pathData,
      principalPathData,
      yieldPathData,
      hasBreakdown,
      minBalance,
      maxBalance,
      trend,
      summary,
    };
  }, [data, width, height, showYieldBreakdown]);

  const trendColor = useMemo(() => {
    switch (chartData.trend) {
      case "up": return "stroke-brand"; // Green for positive trend
      case "down": return "stroke-red-400"; // Red for negative trend
      default: return "stroke-muted"; // Neutral for flat
    }
  }, [chartData.trend]);

  const finalAriaLabel = ariaLabel || chartData.summary;

  return (
    <div className={`inline-block ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
        role="img"
        aria-label={finalAriaLabel}
      >
        {/* Background grid for context (subtle) */}
        <defs>
          <pattern
            id="sparkline-grid"
            width="20"
            height="10"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 0 0 0 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.1"
            />
          </pattern>
        </defs>

        {data.length > 0 && (
          <rect
            width={width}
            height={height}
            fill="url(#sparkline-grid)"
          />
        )}

        {/* Principal area (deposits/withdrawals) */}
        {chartData.hasBreakdown && chartData.principalPathData && (
          <path
            d={chartData.principalPathData}
            className="fill-brand/20 stroke-brand/60"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Yield area (harvest-driven growth) */}
        {chartData.hasBreakdown && chartData.yieldPathData && (
          <path
            d={chartData.yieldPathData}
            className="fill-emerald-400/40 stroke-emerald-400"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Main trend line */}
        {chartData.pathData && (
          <path
            d={chartData.pathData}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`${trendColor} transition-colors duration-200`}
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Data points (small dots) */}
        {chartData.points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="1.5"
            fill="currentColor"
            className={`${trendColor} transition-colors duration-200`}
          >
            <title>{`Balance: ${new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format(point.balance)}`}</title>
          </circle>
        ))}

        {/* Empty state indicator */}
        {data.length === 0 && (
          <>
            <line
              x1="0"
              y1={height / 2}
              x2={width}
              y2={height / 2}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3,3"
              className="stroke-muted opacity-50"
            />
            <text
              x={width / 2}
              y={height / 2 - 5}
              textAnchor="middle"
              fontSize="10"
              fill="currentColor"
              className="fill-muted"
            >
              No data
            </text>
          </>
        )}
      </svg>

      {/* Legend for the principal/yield breakdown */}
      {chartData.hasBreakdown && (
        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-brand/40" aria-hidden="true" />
            Principal
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400/60" aria-hidden="true" />
            Yield
          </span>
        </div>
      )}

      {/* Screen reader only summary */}
      <span className="sr-only">
        {chartData.summary}
      </span>
    </div>
  );
}