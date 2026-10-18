import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsRecovery } from './browser-diagnostics-recovery';

function recovery(): { readonly subject: DiagnosticsRecovery; readonly connect: () => number } {
  let attempts = 0;
  const subject = new DiagnosticsRecovery({
    connect: (): void => {
      attempts += 1;
    },
    eligible: (): boolean => true,
    connected: (): boolean => false,
  });
  return { subject, connect: (): number => attempts };
}

describe('browser socket recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps reconnecting after any number of failures', () => {
    const { subject, connect } = recovery();
    subject.resume();
    for (let failure = 0; failure < 20; failure += 1) {
      subject.closed();
      vi.advanceTimersByTime(30_000);
    }
    expect(connect()).toBe(21);
  });

  it('backs off exponentially up to a ceiling', () => {
    const times: number[] = [];
    const subject = new DiagnosticsRecovery({
      connect: (): void => {
        times.push(Date.now());
      },
      eligible: (): boolean => true,
      connected: (): boolean => false,
    });
    subject.resume();
    for (let failure = 0; failure < 9; failure += 1) {
      subject.closed();
      vi.advanceTimersToNextTimer();
    }
    const gaps = times.slice(1).map((time, index) => time - (times[index] ?? 0));
    expect(gaps).toEqual([250, 500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it('restarts the backoff when the route changes', () => {
    const { subject, connect } = recovery();
    subject.resume();
    subject.closed();
    vi.advanceTimersByTime(250);
    subject.closed();
    subject.resume();
    expect(connect()).toBe(3);
  });

  it('stops for good once disposed', () => {
    const { subject, connect } = recovery();
    subject.resume();
    subject.closed();
    subject.dispose();
    vi.advanceTimersByTime(60_000);
    expect(connect()).toBe(1);
  });
});
