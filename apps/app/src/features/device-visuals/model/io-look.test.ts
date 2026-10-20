import { describe, expect, it } from 'vitest';
import type { ToothbrushFacts } from '../types';
import {
  displayOf,
  driveDuration,
  driveOf,
  driveStops,
  faceStars,
  headRimOf,
  ioLabel,
  ioStateOf,
  type IoRing,
  materialOf,
  moveOf,
  pipsOf,
  ringNameOf,
  ringOf,
  timerText,
} from './io-look';

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

describe('the SmartRing', () => {
  it('is unlit while the brush sleeps or cannot be reached', () => {
    for (const state of ['asleep', 'unreachable', 'busy'] as const) {
      expect(ringOf(facts(), state)).toEqual({ kind: 'unlit' });
    }
  });

  it('shows the configured colour at rest and a grey dashed ring when it was never read', () => {
    expect(ringOf(facts(), 'standby')).toEqual({ kind: 'configured', hex: '#3870ff' });
    expect(ringOf(facts({ ring: null }), 'summary')).toEqual({ kind: 'unread' });
    expect(ringOf(facts(), 'charging')).toEqual({ kind: 'configured', hex: '#3870ff' });
  });

  it('follows the pressure while brushing', () => {
    const level = (pressure: ToothbrushFacts['pressure']): IoRing =>
      ringOf(facts({ pressure }), 'brushing');
    expect(level('no_contact')).toEqual({ kind: 'pressure', level: 'light' });
    expect(level(null)).toEqual({ kind: 'pressure', level: 'light' });
    expect(level('optimal')).toEqual({ kind: 'pressure', level: 'good' });
    expect(level('too_high')).toEqual({ kind: 'pressure', level: 'hard' });
  });

  it('names the measured colours and calls anything else custom', () => {
    expect(ringNameOf('#3870ff')).toBe('blue');
    expect(ringNameOf('#FFFFFF')).toBe('white');
    expect(ringNameOf('#123456')).toBe('custom');
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

describe('the head rim', () => {
  it('is green with life left, amber near the end and red when due', () => {
    expect(headRimOf(facts({ daysLeftRatio: 0.6 }))).toBe('positive');
    expect(headRimOf(facts({ daysLeftRatio: 0.15 }))).toBe('warning');
    expect(headRimOf(facts({ daysLeftRatio: 0 }))).toBe('critical');
  });

  it('is neutral without a baseline or a fitted head', () => {
    expect(headRimOf(facts({ daysLeftRatio: null }))).toBeNull();
    expect(headRimOf(facts({ head: 'missing' }))).toBeNull();
  });
});

describe('the drive motion', () => {
  it('oscillates with the period of the mode', () => {
    const period = (mode: ToothbrushFacts['mode']): number => driveOf(facts({ mode })).stepMs;
    expect(period('daily_clean')).toBe(140);
    expect(period('sensitive')).toBe(180);
    expect(period('gum_care')).toBe(160);
    expect(period('whiten')).toBe(130);
    expect(period('intense')).toBe(110);
    expect(period('super_sensitive')).toBe(220);
    expect(period('tongue_clean')).toBe(160);
    expect(period('smart_adapt')).toBe(150);
    expect(period('gentle_white')).toBe(150);
    expect(period(null)).toBe(140);
  });

  it('swings plus and minus nine degrees at a steady pace', () => {
    const drive = driveOf(facts({ mode: 'intense' }));
    expect(driveDuration(drive)).toBe(220);
    expect(driveStops(drive)).toEqual([
      { at: 0, degrees: -9 },
      { at: 50, degrees: 9 },
      { at: 100, degrees: -9 },
    ]);
  });

  it('pulses in groups of three swings and rests 200 ms between groups', () => {
    const drive = driveOf(facts({ mode: 'gum_care' }));
    expect(drive.steps).toHaveLength(6);
    expect(drive.restMs).toBe(200);
    expect(driveDuration(drive)).toBe(1160);
    const stops = driveStops(drive);
    expect(stops.at(-1)).toEqual({ at: 100, degrees: 0 });
    expect(stops.at(-2)).toEqual({ at: 82.76, degrees: 0 });
  });

  it('alternates strong and light strokes for whiten', () => {
    const drive = driveOf(facts({ mode: 'whiten' }));
    expect(drive.steps).toEqual([-9, 9, -4, 4]);
    expect(driveStops(drive).at(-1)).toEqual({ at: 100, degrees: -9 });
  });
});

describe('what the handle does when the activity changes', () => {
  it('sweeps the ring when the brush is picked up or lifted off the charger', () => {
    expect(moveOf('asleep', 'standby')).toBe('wake');
    expect(moveOf('off', 'brushing')).toBe('wake');
    expect(moveOf('charging', 'standby')).toBe('wake');
  });

  it('ripples the button when brushing starts, pauses or stops', () => {
    expect(moveOf('standby', 'brushing')).toBe('press');
    expect(moveOf('brushing', 'paused')).toBe('press');
    expect(moveOf('paused', 'standby')).toBe('press');
    expect(moveOf('brushing', 'asleep')).toBe('press');
  });

  it('does nothing when nothing changed or the brush only went to rest', () => {
    expect(moveOf('standby', 'standby')).toBeNull();
    expect(moveOf('standby', 'asleep')).toBeNull();
    expect(moveOf('standby', 'charging')).toBeNull();
  });
});

describe('the handle material', () => {
  it('is black unless the handle colour is known', () => {
    expect(materialOf(facts()).body).toBe('#1C1D22');
    expect(materialOf(facts({ handle: 'rose' })).body).toBe('#E6A9B6');
  });
});

describe('the accessible name', () => {
  it('names the state, the ring, the timer and the quarter while brushing', () => {
    expect(
      ioLabel(
        facts({ activity: 'brushing', pressure: 'optimal', elapsedS: 72, sector: 2 }),
        'active',
      ),
    ).toBe('Oral-B iO, brushing, ring green: good pressure, 1:12, quarter 2 of 4');
  });

  it('says too hard and light pressure in words', () => {
    expect(ioLabel(facts({ activity: 'brushing', pressure: 'too_high' }), 'active')).toContain(
      'ring red: too hard',
    );
    expect(ioLabel(facts({ activity: 'brushing' }), 'active')).toContain(
      'ring grey: light pressure',
    );
  });

  it('names the configured colour and the battery at rest', () => {
    expect(ioLabel(facts(), 'active')).toBe('Oral-B iO, awake, ring blue, battery 80 percent');
  });

  it('says when the ring colour was not read yet', () => {
    expect(ioLabel(facts({ ring: null }), 'active')).toContain('ring colour not read yet');
  });

  it('drops the ring for a sleeping, unreachable or busy brush', () => {
    expect(ioLabel(facts({ activity: 'asleep' }), 'idle')).toBe(
      'Oral-B iO, asleep, battery 80 percent',
    );
    expect(ioLabel(facts(), 'offline')).toBe('Oral-B iO, unreachable, battery 80 percent');
    expect(ioLabel(facts({ link: 'busy' }), 'active')).toBe('Oral-B iO, busy, battery 80 percent');
  });

  it('names the summary and the charger', () => {
    expect(ioLabel(facts({ face: 4 }), 'active')).toContain('showing the result');
    expect(ioLabel(facts({ activity: 'charging', battery: null }), 'idle')).toBe(
      'Oral-B iO, charging, ring blue',
    );
  });
});
