import { render, screen, act } from '@testing-library/react';
import { CooldownCountdown } from './CooldownCountdown';

describe('CooldownCountdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the remaining time until the cooldown ends', () => {
    const endsAt = new Date(Date.now() + 90_000);
    render(<CooldownCountdown endsAt={endsAt} />);

    expect(screen.getByText(/1:30|01:30/)).toBeInTheDocument();
  });

  it('counts down as time passes', () => {
    const endsAt = new Date(Date.now() + 10_000);
    render(<CooldownCountdown endsAt={endsAt} />);

    expect(screen.getByText(/0:10|00:10/)).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    expect(screen.getByText(/0:05|00:05/)).toBeInTheDocument();
  });

  it('shows a completed state once the cooldown has elapsed', () => {
    const endsAt = new Date(Date.now() - 1_000);
    render(<CooldownCountdown endsAt={endsAt} />);

    expect(screen.getByText(/ready|complete|available/i)).toBeInTheDocument();
  });

  it('transitions to the completed state when the countdown reaches zero', () => {
    const endsAt = new Date(Date.now() + 3_000);
    render(<CooldownCountdown endsAt={endsAt} />);

    act(() => {
      jest.advanceTimersByTime(3_000);
    });

    expect(screen.getByText(/ready|complete|available/i)).toBeInTheDocument();
  });

  it('invokes onComplete when the cooldown finishes', () => {
    const onComplete = jest.fn();
    const endsAt = new Date(Date.now() + 2_000);
    render(<CooldownCountdown endsAt={endsAt} onComplete={onComplete} />);

    act(() => {
      jest.advanceTimersByTime(2_000);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete before the cooldown finishes', () => {
    const onComplete = jest.fn();
    const endsAt = new Date(Date.now() + 10_000);
    render(<CooldownCountdown endsAt={endsAt} onComplete={onComplete} />);

    act(() => {
      jest.advanceTimersByTime(4_000);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('cleans up its interval on unmount', () => {
    const clearSpy = jest.spyOn(window, 'clearInterval');
    const endsAt = new Date(Date.now() + 30_000);
    const { unmount } = render(<CooldownCountdown endsAt={endsAt} />);

    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
