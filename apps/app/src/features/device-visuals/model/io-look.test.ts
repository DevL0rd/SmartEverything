import { describe, expect, it } from 'vitest';
import type { ToothbrushFacts } from '../types';
import { displayOf, faceStars, ioStateOf, pipsOf, timerText } from './io-look';

function facts(patch: Partial<ToothbrushFacts> = {}): ToothbrushFacts {
  return {
    brand: 'oralb',
    activity: 'standby',
    link: 'linked',
    mode: 'daily_clean',
    intensity: null,
    pressure: null,
    head: 'fitted',
    headType: null,
    wear: null,
    battery: 80,
    fault: false,
    ring: '#3870ff',
    face: null,
    sector: null,
    daysLeftRatio: 0.5,
    elapsedS: null,
    display: true,
    handle: null,
    ...patch,
  };
}

describe('the state of the iO handle', () => {
  it('maps every activity to a drawn state', () => {
    expect(ioStateOf(facts({ activity: 'asleep' }), 'idle')).toBe('asleep');
    expect(ioStateOf(facts({ activity: 'off' }), 'idle')).toBe('asleep');
    expect(ioStateOf(facts({ activity: 'standby' }), 'active')).toBe('standby');
    expect(ioStateOf(facts({ activity: 'brushing' }), 'active')).toBe('brushing');
    expect(ioStateOf(facts({ activity: 'paused' }), 'active')).toBe('paused');
    expect(ioStateOf(facts({ activity: 'charging' }), 'idle')).toBe('charging');
  });

  it('shows the summary when a result face is kept on a handle that is awake', () => {
    expect(ioStateOf(facts({ face: 7 }), 'active')).toBe('summary');
    expect(ioStateOf(facts({ face: 7, activity: 'brushing' }), 'active')).toBe('brushing');
  });

  it('marks a lost or busy link ahead of the activity', () => {
    expect(ioStateOf(facts({ activity: 'brushing' }), 'offline')).toBe('unreachable');
    expect(ioStateOf(facts({ link: 'bluetooth_off' }), 'active')).toBe('unreachable');
    expect(ioStateOf(facts({ link: 'busy', activity: 'brushing' }), 'offline')).toBe('busy');
  });
});

describe('the display glass', () => {
  it('has nothing at all on a handle without a display', () => {
    for (const state of ['brushing', 'standby', 'asleep', 'summary'] as const) {
      expect(displayOf(facts({ display: false }), state)).toEqual({ kind: 'none' });
    }
  });

  it('is dark while asleep, unreachable or busy', () => {
    for (const state of ['asleep', 'unreachable', 'busy'] as const) {
      expect(displayOf(facts(), state)).toEqual({ kind: 'dark' });
    }
  });

  it('shows the timer with the quarter pips and the battery while brushing', () => {
    const brushing = facts({ activity: 'brushing', elapsedS: 72.4, sector: 3 });
    expect(displayOf(brushing, 'brushing')).toEqual({
      kind: 'timer',
      text: '1:12',
      pips: { current: 2 },
      battery: 80,
    });
    expect(displayOf(brushing, 'paused')).toMatchObject({ kind: 'timer', text: '1:12' });
  });

  it('draws no pips for tongue clean, an unknown quarter or more than four sections', () => {
    expect(pipsOf(facts({ sector: null }))).toBeNull();
    expect(pipsOf(facts({ sector: 5 }))).toBeNull();
    expect(pipsOf(facts({ sector: 1, mode: 'tongue_clean' }))).toBeNull();
    expect(pipsOf(facts({ sector: 4 }))).toEqual({ current: 3 });
  });

  it('shows the result face and the time in the summary', () => {
    expect(displayOf(facts({ face: 7, elapsedS: 125 }), 'summary')).toEqual({
      kind: 'summary',
      face: 7,
      text: '2:05',
    });
  });

  it('shows the percent while charging and the mode initials in standby', () => {
    expect(displayOf(facts({ battery: 64 }), 'charging')).toEqual({
      kind: 'charging',
      percent: 64,
    });
    expect(displayOf(facts({ mode: 'gum_care' }), 'standby')).toEqual({
      kind: 'standby',
      initials: 'GC',
      battery: 80,
    });
    expect(displayOf(facts({ mode: null }), 'standby')).toMatchObject({ initials: null });
  });

  it('writes the timer as minutes and seconds', () => {
    expect(timerText(0)).toBe('0:00');
    expect(timerText(59.9)).toBe('0:59');
    expect(timerText(600)).toBe('10:00');
    expect(timerText(null)).toBe('-:--');
  });

  it('puts a result face on one of three star bands', () => {
    expect([0, 1, 2, 4, 5, 8, 9, 11].map(faceStars)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});
