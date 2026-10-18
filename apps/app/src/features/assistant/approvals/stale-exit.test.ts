import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STALE_EXIT_MS, StaleExit } from './stale-exit';

describe('StaleExit', () => {
  const left: string[] = [];
  let exit: StaleExit;

  beforeEach(() => {
    vi.useFakeTimers();
    left.length = 0;
    exit = new StaleExit((id) => left.push(id));
  });

  afterEach(() => {
    exit.stop();
    vi.useRealTimers();
  });

  it('leaves by itself after ten seconds when focus is outside', () => {
    exit.sync(['a']);
    vi.advanceTimersByTime(STALE_EXIT_MS - 1);
    expect(left).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(left).toEqual(['a']);
  });

  it('stays while focus is inside and leaves once focus moves out', () => {
    exit.sync(['a']);
    exit.focus(true);
    vi.advanceTimersByTime(STALE_EXIT_MS * 3);
    expect(left).toEqual([]);
    exit.focus(false);
    expect(left).toEqual(['a']);
  });

  it('does not restart the clock when the same request is synced again', () => {
    exit.sync(['a']);
    vi.advanceTimersByTime(6000);
    exit.sync(['a']);
    vi.advanceTimersByTime(4000);
    expect(left).toEqual(['a']);
  });

  it('times each request from when it went stale', () => {
    exit.sync(['a']);
    vi.advanceTimersByTime(6000);
    exit.sync(['a', 'b']);
    vi.advanceTimersByTime(4000);
    expect(left).toEqual(['a']);
    vi.advanceTimersByTime(6000);
    expect(left).toEqual(['a', 'b']);
  });

  it('drops a request that stopped being stale before its time', () => {
    exit.sync(['a']);
    vi.advanceTimersByTime(5000);
    exit.sync([]);
    vi.advanceTimersByTime(STALE_EXIT_MS);
    expect(left).toEqual([]);
  });

  it('forgets a request that came due while focus was inside once it is dismissed', () => {
    exit.sync(['a']);
    exit.focus(true);
    vi.advanceTimersByTime(STALE_EXIT_MS);
    exit.sync([]);
    exit.focus(false);
    expect(left).toEqual([]);
  });
});
