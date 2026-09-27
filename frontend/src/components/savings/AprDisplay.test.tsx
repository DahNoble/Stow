import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AprDisplay from './AprDisplay';

describe('AprDisplay', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders a loading state while the yield rate is being fetched', () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    );

    render(<AprDisplay />);

    expect(screen.getByTestId('apr-display-loading')).toBeInTheDocument();
  });

  it('renders the fixture APR value returned by the yield endpoint', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ rate: 0.0525 }),
    });

    render(<AprDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId('apr-display-value')).toHaveTextContent('5.25%');
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/savings/yield/rate'),
      expect.anything(),
    );
  });

  it('formats a zero rate as 0.00%', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ rate: 0 }),
    });

    render(<AprDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId('apr-display-value')).toHaveTextContent('0.00%');
    });
  });

  it('renders an error state when the yield endpoint fails', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'boom' }),
    });

    render(<AprDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId('apr-display-error')).toBeInTheDocument();
    });
  });

  it('renders an error state when the fetch rejects', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network down'),
    );

    render(<AprDisplay />);

    await waitFor(() => {
      expect(screen.getByTestId('apr-display-error')).toBeInTheDocument();
    });
  });
});
