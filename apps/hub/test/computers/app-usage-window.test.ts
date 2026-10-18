import { describe, expect, it } from 'vitest';
import { periodStarts } from '../../src/computers/computer-session-routes';

describe('app usage windows', () => {
  it('start at midnight in the home time zone, whatever the hub process zone is', () => {
    const { today, week } = periodStarts(new Date('2026-10-17T23:30:00.000Z'), 'Pacific/Auckland');
    expect(today.toISOString()).toBe('2026-10-17T11:00:00.000Z');
    expect(week.toISOString()).toBe('2026-10-11T11:00:00.000Z');
  });

  it('keep local midnight across the end of daylight saving time', () => {
    const { today, week } = periodStarts(new Date('2026-11-04T15:00:00.000Z'), 'America/New_York');
    expect(today.toISOString()).toBe('2026-11-04T05:00:00.000Z');
    expect(week.toISOString()).toBe('2026-10-29T04:00:00.000Z');
  });
});
