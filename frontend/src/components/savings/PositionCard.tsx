import React from 'react';
import { useYieldRate } from './useYieldRate';

interface Position {
  id: string;
  amount: number;
  currency: string;
  openedAt: string;
}

interface PositionCardProps {
  position: Position;
}

function formatApr(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

export function PositionCard({ position }: PositionCardProps) {
  const { rate, loading, error } = useYieldRate();

  return (
    <div className="position-card">
      <div className="position-card__header">
        <span className="position-card__amount">
          {position.amount} {position.currency}
        </span>
        <span className="position-card__opened">
          Opened {new Date(position.openedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="position-card__apr" data-testid="position-card-apr">
        {loading ? (
          <span className="apr-loading" data-testid="apr-loading">
            Loading APR…
          </span>
        ) : error ? (
          <span className="apr-error" data-testid="apr-error">
            APR unavailable
          </span>
        ) : (
          <span className="apr-value" data-testid="apr-value">
            APR {rate !== null ? formatApr(rate) : '—'}
          </span>
        )}
      </div>
    </div>
  );
}

export default PositionCard;
