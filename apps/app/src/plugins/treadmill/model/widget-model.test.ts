import { TREADMILL_LIVE_FRAME, type TreadmillLiveFrame } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  bodyHeightOf,
  calendarBarsHeight,
  calendarWeeks,
  climbRingOf,
  gaugePxOf,
  inclineFigureUnit,
  inclineFill,
  inclineReadoutOf,
  legendLines,
  liveFaceOf,
  speedInclineSentence,
  stripShowsTrend,
  visualPxOf,
} from './widget-model';

const RANGE = { min: 0, max: 20, step: 1, remoteMax: null } as const;

function frameOf(
  belt: Partial<TreadmillLiveFrame['belt']>,
  climbM: number | null = null,
): TreadmillLiveFrame {
  return TREADMILL_LIVE_FRAME.parse({
    at: '2026-10-19T10:00:00.000Z',
    belt: {
      state: 'running',
      mode: 'manual',
      speedKmh: 6,
      targetSpeedKmh: null,
      timeS: 60,
      distanceM: 100,
      steps: null,
      cadence: null,
      inclinePercent: 6,
      button: null,
      childLock: false,
      controlLost: false,
      link: 'linked',
      ...belt,
    },
    session:
      climbM === null
        ? null
        : {
            startedAt: '2026-10-19T09:59:00.000Z',
            activeSeconds: 60,
            pausedSeconds: 0,
            zones: { walk: 60, jog: 0, run: 0 },
            maxKmh: 6,
            splits: [],
            climbM,
          },
    body: null,
  });
}

describe('how the treadmill widget lays itself out', () => {
  it('picks a strip for small frames, a stack for narrow tall ones, a row for wide short ones and a panel for wide tall ones', () => {
    expect(liveFaceOf('xs')).toBe('strip');
    expect(liveFaceOf('m')).toBe('strip');
    expect(liveFaceOf('l')).toBe('stack');
    expect(liveFaceOf('w')).toBe('row');
    expect(liveFaceOf('xl')).toBe('panel');
  });

  it('takes the header off the height of the frame', () => {
    expect(bodyHeightOf({ width: 600, height: 200, idiom: 'touch' })).toBe(148);
    expect(bodyHeightOf({ width: 600, height: 200, idiom: 'pointer' })).toBe(156);
    expect(bodyHeightOf({ width: 600, height: 20, idiom: 'touch' })).toBe(0);
  });

  it('caps the picture and the gauge by the height of the body, never by the width', () => {
    expect(visualPxOf('panel', 300)).toBe(128);
    expect(visualPxOf('panel', 100)).toBe(72);
    expect(visualPxOf('strip', 60)).toBe(48);
    expect(gaugePxOf(500)).toBe(200);
    expect(gaugePxOf(150)).toBe(142);
    expect(gaugePxOf(40)).toBe(112);
  });

  it('adds the speed trend to a strip only when the strip has room for it', () => {
    expect(stripShowsTrend(348)).toBe(false);
    expect(stripShowsTrend(522)).toBe(true);
  });

  it('adds the month bars under the calendar only where they fit below the footer', () => {
    expect(calendarBarsHeight(280, 1088)).toBe(67);
    expect(calendarBarsHeight(272, 348)).toBe(39);
    expect(calendarBarsHeight(128, 1088)).toBe(0);
  });

  it('shows more weeks on a wider calendar rather than bigger cells', () => {
    expect(calendarWeeks(100)).toBe(8);
    expect(calendarWeeks(300)).toBe(20);
    expect(calendarWeeks(2000)).toBe(53);
  });

  it('reads speed, incline and climb into one sentence and one violet track fill', () => {
    const readout = inclineReadoutOf(frameOf({ inclineScale: 'percent' }, 42.4), RANGE);
    expect(readout).toMatchObject({
      value: '6 %',
      figure: '6',
      unit: '% incline',
      fill: 0.3,
      note: 'Climb 42 m',
      climb: '42 m',
    });
    expect(speedInclineSentence(6, readout)).toBe(
      'Speed 6.0 kilometres per hour, Incline 6 %, climb 42 m',
    );
  });

  it('shows the moving deck instead of the climb while the incline changes', () => {
    const readout = inclineReadoutOf(
      frameOf({ inclineScale: 'levels', inclineTarget: 9 }, 10),
      RANGE,
    );
    expect(readout?.note).toBe('Rising to 9');
    expect(readout?.value).toBe('Level 6');
    expect(readout?.sentence).toBe('Incline Level 6, Rising to 9, climb 10 m');
  });

  it('shows no incline for a belt without a range or a reading', () => {
    expect(inclineReadoutOf(frameOf({}), null)).toBeNull();
    expect(inclineReadoutOf(frameOf({ inclinePercent: null }), RANGE)).toBeNull();
    expect(speedInclineSentence(0, null)).toBe('Speed 0.0 kilometres per hour');
  });

  it('keeps the unit honest about the unconfirmed scale and clamps the fill', () => {
    expect(inclineFigureUnit('unconfirmed')).toBe('incline');
    expect(inclineFigureUnit('levels')).toBe('incline level');
    expect(inclineFill(30, RANGE)).toBe(1);
    expect(inclineFill(-2, RANGE)).toBe(0);
    expect(inclineFill(5, { min: 3, max: 3, step: 1, remoteMax: null })).toBe(0);
  });

  it('compares the climb ring with last week and hides it for a belt that never climbed', () => {
    expect(climbRingOf({ climbM: 0 }, { climbM: 0 })).toBeNull();
    expect(climbRingOf({ climbM: 60 }, { climbM: 120 })).toMatchObject({
      key: 'climb',
      colour: 'viz-violet',
      done: '60 m',
      goal: '120 m last week',
      progress: 0.5,
    });
    expect(climbRingOf({ climbM: 30 }, { climbM: 0 })?.progress).toBe(1);
    expect(climbRingOf({ climbM: 0 }, { climbM: 50 })?.progress).toBe(0);
  });

  it('lists as many ring lines as the body height holds, five when wide', () => {
    expect(legendLines(true, 40)).toBe(5);
    expect(legendLines(false, 60)).toBe(3);
    expect(legendLines(false, 100)).toBe(4);
  });
});
