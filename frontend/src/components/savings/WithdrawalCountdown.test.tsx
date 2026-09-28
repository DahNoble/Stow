import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalCountdown } from './WithdrawalCountdown';

describe('WithdrawalCountdown', () => {
  const base = new Date('2024-01-01T00:00:00.000Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(base);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the remaining time before claimable_at', () => {
    render(<WithdrawalCountdown claimableAt={base + 90_000} />);

    expect(screen.getByTestId('withdrawal-countdown')).toHaveTextContent('01:30');
    expect(screen.queryByTestId('withdrawal-claim-now')).not.toBeInTheDocument();
  });

  it('counts down live without a refresh', () => {
    render(<WithdrawalCountdown claimableAt={base + 5_000} />);

    expect(screen.getByTestId('withdrawal-countdown')).toHaveTextContent('00:05');

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByTestId('withdrawal-countdown')).toHaveTextContent('00:03');
  });

  it('switches to the claim now CTA exactly at claimable_at', () => {
    render(<WithdrawalCountdown claimableAt={base} />);

    expect(screen.getByTestId('withdrawal-claim-now')).toBeInTheDocument();
    expect(screen.queryByTestId('withdrawal-countdown')).not.toBeInTheDocument();
  });

  it('shows the claim now CTA after claimable_at has elapsed', () => {
    render(<WithdrawalCountdown claimableAt={base - 60_000} />);

    expect(screen.getByTestId('withdrawal-claim-now')).toBeInTheDocument();
  });

  it('transitions from countdown to CTA as time passes', () => {
    render(<WithdrawalCountdown claimableAt={base + 2_000} />);

    expect(screen.getByTestId('withdrawal-countdown')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByTestId('withdrawal-claim-now')).toBeInTheDocument();
  });

  it('invokes onClaim when the CTA is clicked', () => {
    const onClaim = vi.fn();
    render(<WithdrawalCountdown claimableAt={base - 1} onClaim={onClaim} />);

    screen.getByTestId('withdrawal-claim-now').click();

    expect(onClaim).toHaveBeenCalledTimes(1);
  });
});
