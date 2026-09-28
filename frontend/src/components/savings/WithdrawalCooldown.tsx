import React, { useCallback, useState } from 'react';
import { useSavings } from '../../hooks/useSavings';
import { useToast } from '../../hooks/useToast';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button } from '../common/Button';

interface WithdrawalCooldownProps {
  positionId: string;
  /** Unix timestamp (seconds) when the cooldown elapses and the withdrawal can be finalized. */
  cooldownEndsAt: number;
  /** Called after a successful cancel so the position card can refresh re-minted shares. */
  onCancelled?: () => void | Promise<void>;
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Displays the withdrawal cooldown countdown and lets the user cancel the
 * pending withdrawal request before the cooldown elapses. Cancelling calls the
 * contract's `cancel_withdraw` flow, which re-mints the user's shares.
 */
export const WithdrawalCooldown: React.FC<WithdrawalCooldownProps> = ({
  positionId,
  cooldownEndsAt,
  onCancelled,
}) => {
  const { cancelWithdraw } = useSavings();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const remaining = Math.max(0, cooldownEndsAt - Math.floor(Date.now() / 1000));

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    try {
      await cancelWithdraw(positionId);
      showToast({
        type: 'success',
        message: 'Withdrawal request cancelled. Your shares have been re-minted.',
      });
      setConfirmOpen(false);
      await onCancelled?.();
    } catch (err) {
      showToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to cancel withdrawal request.',
      });
    } finally {
      setSubmitting(false);
    }
  }, [cancelWithdraw, positionId, onCancelled, showToast]);

  return (
    <div className="withdrawal-cooldown">
      <p className="withdrawal-cooldown__label">Withdrawal pending</p>
      <p className="withdrawal-cooldown__timer">
        Available in {formatRemaining(remaining)}
      </p>
      <Button
        variant="secondary"
        onClick={() => setConfirmOpen(true)}
        disabled={submitting}
      >
        Cancel withdrawal
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Cancel withdrawal request?"
        description="This will cancel your pending withdrawal and re-mint your shares. This action cannot be undone."
        confirmLabel="Cancel withdrawal"
        cancelLabel="Keep request"
        loading={submitting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};

export default WithdrawalCooldown;
