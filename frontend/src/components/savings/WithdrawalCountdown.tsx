import { useEffect, useState } from 'react';

export interface WithdrawalCountdownProps {
  /** ISO timestamp (or ms epoch) at which the withdrawal becomes claimable. */
  claimableAt: string | number | Date;
  /** Called when the user clicks the "claim now" call-to-action. */
  onClaim?: () => void;
  /** Optional label shown while the cooldown is still running. */
  label?: string;
}

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Live countdown for a pending yield withdrawal. Ticks every second so the
 * remaining time stays accurate without a page refresh, and swaps to a
 * "claim now" call-to-action once `claimableAt` has elapsed.
 */
export function WithdrawalCountdown({
  claimableAt,
  onClaim,
  label = 'Withdrawal available in',
}: WithdrawalCountdownProps) {
  const target = toMillis(claimableAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const remaining = target - now;
  const isClaimable = remaining <= 0;

  if (isClaimable) {
    return (
      <button
        type="button"
        className="withdrawal-countdown__claim"
        onClick={onClaim}
        data-testid="withdrawal-claim-now"
      >
        Claim now
      </button>
    );
  }

  return (
    <span
      className="withdrawal-countdown"
      role="timer"
      aria-live="polite"
      data-testid="withdrawal-countdown"
    >
      {label} {formatRemaining(remaining)}
    </span>
  );
}

export default WithdrawalCountdown;
