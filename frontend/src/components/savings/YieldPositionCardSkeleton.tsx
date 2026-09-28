export interface YieldPositionCardSkeletonProps {
  className?: string;
}

/**
 * Placeholder shown in place of the yield position card while its data
 * is being fetched. Matches the layout dimensions of `YieldPositionCard`
 * to avoid content jumps during loading.
 */
export default function YieldPositionCardSkeleton({
  className = "",
}: YieldPositionCardSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading yield position"
      data-testid="yield-position-card-skeleton"
      className={`animate-pulse rounded-2xl border border-border bg-card p-6 ${className}`}
    >
      {/* Title placeholder */}
      <div className="h-6 w-32 rounded bg-white/5" />

      {/* Stats grid matching shares, estimated value, and lifetime yield */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="h-4 w-20 rounded bg-white/5" />
          <div className="mt-2 h-7 w-28 rounded bg-white/5" />
        </div>
        <div>
          <div className="h-4 w-28 rounded bg-white/5" />
          <div className="mt-2 h-7 w-32 rounded bg-white/5" />
        </div>
        <div>
          <div className="h-4 w-24 rounded bg-white/5" />
          <div className="mt-2 h-7 w-28 rounded bg-white/5" />
        </div>
      </div>
      <span className="sr-only">Loading yield position</span>
    </div>
  );
}

export { YieldPositionCardSkeleton };
