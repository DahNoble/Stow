import { useEffect, useState } from 'react';

const YIELD_RATE_ENDPOINT = '/savings/yield/rate';

interface YieldRateResponse {
  apr: number;
}

export interface AprDisplayProps {
  /** Optional pre-fetched APR value; when provided, no request is made. */
  apr?: number;
  /** Optional fetch implementation, defaults to global fetch. */
  fetcher?: typeof fetch;
  /** Optional polling interval in ms, defaults to the endpoint cache TTL. */
  refreshIntervalMs?: number;
  className?: string;
}

const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

export function AprDisplay({
  apr,
  fetcher,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  className,
}: AprDisplayProps) {
  const [rate, setRate] = useState<number | undefined>(apr);
  const [loading, setLoading] = useState<boolean>(apr === undefined);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (apr !== undefined) {
      setRate(apr);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const doFetch = fetcher ?? fetch;

    const load = async () => {
      try {
        const response = await doFetch(YIELD_RATE_ENDPOINT);
        if (!response.ok) {
          throw new Error(`Failed to load yield rate: ${response.status}`);
        }
        const data = (await response.json()) as YieldRateResponse;
        if (!cancelled) {
          setRate(data.apr);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    void load();

    const interval = setInterval(() => {
      void load();
    }, refreshIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apr, fetcher, refreshIntervalMs]);

  if (loading) {
    return (
      <span
        className={className}
        data-testid="apr-display"
        data-state="loading"
        aria-busy="true"
      >
        APR: …
      </span>
    );
  }

  if (error || rate === undefined) {
    return (
      <span className={className} data-testid="apr-display" data-state="error">
        APR: —
      </span>
    );
  }

  return (
    <span className={className} data-testid="apr-display" data-state="ready">
      APR: {rate.toFixed(2)}%
    </span>
  );
}

export default AprDisplay;
