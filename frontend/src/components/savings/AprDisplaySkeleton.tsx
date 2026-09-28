export interface AprDisplaySkeletonProps {
  className?: string;
}

/**
 * Inline placeholder shown in place of the APR display while rate data
 * is being fetched. Matches the inline dimensions of `AprDisplay`
 * to prevent abrupt pop-in or layout shifts.
 */
export default function AprDisplaySkeleton({
  className = "",
}: AprDisplaySkeletonProps) {
  return (
    <span
      role="status"
      aria-label="Loading APR"
      data-testid="apr-display-skeleton"
      className={`inline-flex items-center gap-1.5 animate-pulse align-middle ${className}`}
    >
      <span className="h-4 w-10 rounded bg-white/5" />
      <span className="h-4 w-12 rounded bg-white/5" />
      <span className="sr-only">Loading APR</span>
    </span>
  );
}

export { AprDisplaySkeleton };
