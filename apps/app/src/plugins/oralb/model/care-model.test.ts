import { describe, expect, it } from 'vitest';
import {
  COUNTERS_LOCKED,
  batterySessionsLine,
  countdownLabel,
  countdownOf,
  counterDigits,
  countersOf,
  countedFrom,
  dayWord,
  daysSeriesLabel,
  daysSeriesOf,
  pacerBarOf,
  reminderTone,
  reminderWord,
  ringHex,
  ringText,
  seriesChip,
  slotsOf,
  toneOfDays,
  type OralbHandle,
  type TimelineSpan,
} from './care-model';

const HEAD = {
  state: 'fitted',
  type: null,
  usageS: null,
  limitS: null,
  wearPercent: null,
  sessionsLeft: 11,
  replaceBy: null,
  madeOn: null,
  daysLeft: 23,
  secondsLeft: 1300,
  reminder: 'on',
  baselineDays: 90,
} as const;

const LIMITS = { warnDays: 14, dueDays: 0 } as const;

describe('the head countdown', () => {
  it('shows days big and sessions small, with the ring share against the baseline', () => {
    const countdown = countdownOf(HEAD, LIMITS);
    expect(countdown).toMatchObject({
      big: '23 days',
      small: 'about 11 sessions left',
      tone: 'positive',
    });
    expect(countdown?.share).toBeCloseTo(23 / 90);
  });

  it('turns amber at the warning days and red at due', () => {
    expect(toneOfDays(14, 14, 0)).toBe('warning');
    expect(toneOfDays(15, 14, 0)).toBe('positive');
    expect(toneOfDays(0, 14, 0)).toBe('critical');
    expect(countdownOf({ ...HEAD, daysLeft: 0 }, LIMITS)).toMatchObject({
      big: 'Due now',
      tone: 'critical',
    });
  });

  it('says one day, hides a missing session count and needs a reading', () => {
    expect(dayWord(1)).toBe('1 day');
    expect(countdownOf({ ...HEAD, daysLeft: 1, sessionsLeft: null }, LIMITS)?.small).toBeNull();
    expect(countdownOf({ ...HEAD, daysLeft: null }, LIMITS)).toBeNull();
  });

  it('falls back to ninety days without a baseline and never passes full', () => {
    expect(countdownOf({ ...HEAD, baselineDays: null }, LIMITS)?.share).toBeCloseTo(23 / 90);
    expect(countdownOf({ ...HEAD, daysLeft: 200 }, LIMITS)?.share).toBe(1);
  });

  it('describes the ring for a screen reader', () => {
    expect(countdownLabel(countdownOf(HEAD, LIMITS))).toBe(
      'Brush head: 23 days left, about 11 sessions left',
    );
    expect(countdownLabel(null)).toBe('Brush head countdown not read yet');
  });

  it('names the reminder and where the count started', () => {
    expect(reminderWord('snooze')).toBe('Reminder snoozed');
    expect(reminderWord('off')).toBe('Reminder off');
    expect(reminderWord(null)).toBeNull();
    expect(reminderTone('off')).toBe('neutral');
    expect(reminderTone('snooze')).toBe('warning');
    expect(reminderTone('on')).toBe('positive');
    expect(countedFrom(true)).toContain('reset on the handle');
    expect(countedFrom(false)).toBe('Counted from the first reading.');
  });
});

describe('the days left over six months', () => {
  const NOW = Date.parse('2026-10-18T00:00:00.000Z');
  const DAY = 86_400;

  function row(first: string, last: string, start: number, used: number): TimelineSpan {
    return { firstSeen: first, lastSeen: last, limitS: start * DAY, usageS: used * DAY };
  }

  it('marks each reset as a new head and draws one pair of points per head', () => {
    const series = daysSeriesOf(
      [
        row('2026-06-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 90, 60),
        row('2026-08-02T00:00:00.000Z', '2026-10-17T00:00:00.000Z', 90, 70),
      ],
      NOW,
    );
    expect(series?.points).toHaveLength(4);
    expect(series?.points[1]?.days).toBe(30);
    expect(series?.resets).toEqual([Date.parse('2026-08-02T00:00:00.000Z')]);
    expect(daysSeriesLabel(series)).toContain('2 heads');
  });

  it('forgets heads that ended before the window and needs readings to draw', () => {
    expect(
      daysSeriesOf([row('2025-01-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z', 90, 40)], NOW),
    ).toBeNull();
    expect(daysSeriesOf([], NOW)).toBeNull();
    expect(daysSeriesLabel(null)).toContain('Not enough readings');
  });
});

describe('the battery line', () => {
  it('counts whole sessions on a charge and hides when unavailable', () => {
    expect(batterySessionsLine(1100, 120)).toBe('About 9 brushing sessions left on this charge');
    expect(batterySessionsLine(130, 120)).toBe('About 1 brushing session left on this charge');
    expect(batterySessionsLine(60, 120)).toBeNull();
    expect(batterySessionsLine(null, 120)).toBeNull();
    expect(batterySessionsLine(900, null)).toBeNull();
  });
});

describe('the handle card', () => {
  const HANDLE: OralbHandle = {
    protocol: 8,
    modelId: 0x36,
    firmware: 82,
    ringColour: 'blue',
    ringDisplay: [56, 112, 255],
    modeSlots: ['daily_clean', 'whiten'],
    pacer: [30, 30, 30, 30, 0, 0, 0, 0],
    chargeCycles: 12,
    brushingCycles: 640,
    motorSeconds: 7200,
  };

  it('writes the series, ring and swatch', () => {
    expect(seriesChip(HANDLE)).toBe('iO Series · firmware 82');
    expect(ringText(HANDLE)).toBe('Blue');
    expect(ringText({ ringColour: null })).toBe('Ring colour not read yet');
    expect(ringHex(HANDLE.ringDisplay)).toBe('#3870ff');
    expect(ringHex(null)).toBeNull();
    expect(ringHex([1, 2])).toBeNull();
  });

  it('lists the mode slots in handle order and marks the current mode', () => {
    expect(slotsOf(HANDLE.modeSlots, 'whiten').map((slot) => [slot.label, slot.current])).toEqual([
      ['Daily Clean', false],
      ['Whiten', true],
    ]);
  });

  it('draws the pacer as segments with a total, or says it is off', () => {
    expect(pacerBarOf(HANDLE.pacer)).toEqual({
      segments: [30, 30, 30, 30],
      totalS: 120,
      label: '2:00 target',
    });
    expect(pacerBarOf([0, 0, 0, 0, 0, 0, 0, 0]).label).toBe('Pacer off');
    expect(pacerBarOf(null).segments).toEqual([]);
  });

  it('reads counters as odometers only when they were read', () => {
    expect(countersOf(HANDLE).map((counter) => counter.digits.join(''))).toEqual([
      '0012',
      '0640',
      '0002',
    ]);
    expect(
      countersOf({ ...HANDLE, chargeCycles: null, brushingCycles: null, motorSeconds: null }),
    ).toEqual([]);
    expect(counterDigits(7.4, 3)).toEqual(['0', '0', '7']);
    expect(COUNTERS_LOCKED).toBe('Read after the handle test passes');
  });
});
