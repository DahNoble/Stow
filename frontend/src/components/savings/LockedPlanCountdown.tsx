"use client";

import { useEffect, useRef, useState } from "react";

export interface LockedPlanCountdownProps {
  /** ISO timestamp (or ms epoch / Date) at which the plan unlocks. */
  unlockAt: string | number | Date;
  /** Fired once when the countdown reaches zero while mounted. */
  onUnlock?: () => void;
  className?: string;
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function toMillis(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}

export function splitRemaining(ms: number): CountdownParts {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function describeRemaining({ days, hours, minutes }: CountdownParts): string {
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (!days && minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  return parts.length ? `Unlocks in ${parts.join(", ")}` : "Unlocks in under a minute";
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Live days/hours/minutes/seconds countdown to a locked plan's unlock time.
 * Ticks every second and calls `onUnlock` once when the lock expires.
 */
export function LockedPlanCountdown({
  unlockAt,
  onUnlock,
  className = "",
}: LockedPlanCountdownProps) {
  const target = toMillis(unlockAt);
  const [now, setNow] = useState(() => Date.now());
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  const remaining = target - now;
  const isUnlocked = remaining <= 0;

  useEffect(() => {
    setNow(Date.now());
    if (target <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  useEffect(() => {
    if (isUnlocked) onUnlockRef.current?.();
  }, [isUnlocked]);

  if (Number.isNaN(target)) {
    return (
      <p className={`text-sm text-muted ${className}`} data-testid="locked-countdown-invalid">
        Unlock date unavailable
      </p>
    );
  }

  if (isUnlocked) {
    return (
      <p
        className={`text-lg font-semibold text-brand ${className}`}
        data-testid="locked-countdown-unlocked"
      >
        Unlocked
      </p>
    );
  }

  const parts = splitRemaining(remaining);
  const segments: { label: string; value: string }[] = [
    { label: "Days", value: String(parts.days) },
    { label: "Hours", value: pad(parts.hours) },
    { label: "Minutes", value: pad(parts.minutes) },
    { label: "Seconds", value: pad(parts.seconds) },
  ];

  return (
    <div className={className} data-testid="locked-countdown">
      {/* Screen readers get a coarse summary instead of per-second updates. */}
      <span className="sr-only" role="timer" aria-live="off">
        {describeRemaining(parts)}
      </span>
      <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
        {segments.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-background/40 px-2 py-3 text-center"
          >
            <p className="font-mono text-xl sm:text-3xl font-semibold tabular-nums text-foreground">
              {s.value}
            </p>
            <p className="mt-1 text-[10px] sm:text-xs uppercase tracking-wide text-muted">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default LockedPlanCountdown;
