import { describe, expect, it } from 'vitest';
import { sentWindow, STRIP_WINDOW_MS } from './sent-strip';

describe('sentWindow', () => {
  it('covers exactly the last 24 hours and places each send as a short tick', () => {
    const now = Date.parse('2026-10-18T12:00:00.000Z');
    const at = '2026-10-18T10:00:00.000Z';
    const window = sentWindow([at], now);
    expect(window.to - window.from).toBe(STRIP_WINDOW_MS);
    expect(window.segments).toHaveLength(1);
    expect(window.segments[0]?.start).toBe(Date.parse(at));
    expect(window.segments[0]?.state).toBe('sent');
    expect((window.segments[0]?.end ?? 0) - (window.segments[0]?.start ?? 0)).toBeGreaterThan(0);
  });

  it('has no segments when nothing was sent', () => {
    expect(sentWindow([], 0).segments).toEqual([]);
  });
});
