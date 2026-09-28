import { useCallback, useState } from 'react';
import { useYieldActions } from '../../hooks/useYieldActions';
import { ErrorRetry } from '../common/ErrorRetry';

/**
 * Yield opt-in, request-withdraw, and claim actions.
 *
 * Each action surfaces failures through the shared Error/retry UX so a failed
 * yield action is actionable (with a retry) instead of failing silently.
 */
export function YieldActions() {
  const { optIn, requestWithdraw, claim } = useYieldActions();

  const [optInError, setOptInError] = useState<Error | null>(null);
  const [withdrawError, setWithdrawError] = useState<Error | null>(null);
  const [claimError, setClaimError] = useState<Error | null>(null);

  const [optInPending, setOptInPending] = useState(false);
  const [withdrawPending, setWithdrawPending] = useState(false);
  const [claimPending, setClaimPending] = useState(false);

  const handleOptIn = useCallback(async () => {
    setOptInError(null);
    setOptInPending(true);
    try {
      await optIn();
    } catch (err) {
      setOptInError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setOptInPending(false);
    }
  }, [optIn]);

  const handleRequestWithdraw = useCallback(async () => {
    setWithdrawError(null);
    setWithdrawPending(true);
    try {
      await requestWithdraw();
    } catch (err) {
      setWithdrawError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setWithdrawPending(false);
    }
  }, [requestWithdraw]);

  const handleClaim = useCallback(async () => {
    setClaimError(null);
    setClaimPending(true);
    try {
      await claim();
    } catch (err) {
      setClaimError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setClaimPending(false);
    }
  }, [claim]);

  return (
    <div className="yield-actions">
      <div className="yield-action">
        <button type="button" onClick={handleOptIn} disabled={optInPending}>
          {optInPending ? 'Opting in…' : 'Opt in to yield'}
        </button>
        {optInError && (
          <ErrorRetry
            error={optInError}
            onRetry={handleOptIn}
            retrying={optInPending}
            label="Failed to opt in to yield"
          />
        )}
      </div>

      <div className="yield-action">
        <button
          type="button"
          onClick={handleRequestWithdraw}
          disabled={withdrawPending}
        >
          {withdrawPending ? 'Requesting withdrawal…' : 'Request withdrawal'}
        </button>
        {withdrawError && (
          <ErrorRetry
            error={withdrawError}
            onRetry={handleRequestWithdraw}
            retrying={withdrawPending}
            label="Failed to request withdrawal"
          />
        )}
      </div>

      <div className="yield-action">
        <button type="button" onClick={handleClaim} disabled={claimPending}>
          {claimPending ? 'Claiming…' : 'Claim yield'}
        </button>
        {claimError && (
          <ErrorRetry
            error={claimError}
            onRetry={handleClaim}
            retrying={claimPending}
            label="Failed to claim yield"
          />
        )}
      </div>
    </div>
  );
}
