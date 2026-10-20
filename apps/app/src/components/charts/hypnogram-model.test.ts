import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../../format/time';
import {
  GHOST_STEPS,
  blockOf,
  bandOf,
  connectorsOf,
  frameOf,
  ghostPath,
  isUnstaged,
  laneCentre,
  readoutOf,
  spanAt,
  stepAt,
  summaryOf,
  type HypnogramSegment,
} from './hypnogram-model';

const BED = new Date(2026, 9, 18, 23, 0).getTime();

function at(minutes: number): number {
  return BED + minutes * MINUTE_MS;
}

function span(from: number, to: number, stage: HypnogramSegment['stage']): HypnogramSegment {
  return { start: at(from), end: at(to), stage };
}

const NIGHT: readonly HypnogramSegment[] = [
  span(0, 20, 'light'),
  span(20, 80, 'deep'),
  span(80, 90, 'awake'),
  span(90, 150, 'light'),
  span(150, 176, 'rem'),
  span(176, 480, 'light'),
];

const FRAME = frameOf({
  window: { from: at(0), to: at(480) },
  width: 348,
  height: 152,
  compact: false,
  markers: true,
});

function plain(text: string): string {
  return text.replace(/\s/g, ' ');
}

describe('frame', () => {
  it('reserves the gutter, the axis rows and four equal lanes', () => {
    expect(FRAME.left).toBe(44);
    expect(FRAME.right).toBe(344);
    expect(FRAME.plotHeight).toBe(114);
    expect(FRAME.laneHeight).toBe(28.5);
  });

  it('drops the gutter and the tick row when compact', () => {
    const compact = frameOf({
      window: FRAME.window,
      width: 300,
      height: 72,
      compact: true,
      markers: true,
    });
    expect(compact.left).toBe(2);
    expect(compact.plotHeight).toBe(52);
    expect(
      frameOf({ window: FRAME.window, width: 300, height: 72, compact: true, markers: false })
        .plotHeight,
    ).toBe(72);
  });
});

describe('lane placement', () => {
  it('puts awake on top, then REM, light and deep', () => {
    const tops = (['awake', 'rem', 'light', 'deep'] as const).map(
      (stage) => blockOf({ start: at(0), end: at(60), stage }, FRAME).y,
    );
    expect(tops).toEqual([...tops].sort((left, right) => left - right));
    expect(laneCentre(FRAME, 'awake')).toBe(14.25);
    expect(laneCentre(FRAME, 'deep')).toBe(99.75);
  });

  it('draws awake blocks over the whole lane height and others inset', () => {
    const awake = blockOf(span(80, 90, 'awake'), FRAME);
    const deep = blockOf(span(20, 80, 'deep'), FRAME);
    expect(awake.height).toBe(FRAME.laneHeight - 2);
    expect(deep.height).toBe(FRAME.laneHeight - 6);
  });

  it('never draws a block narrower than 2 px and rounds it to its width', () => {
    const sliver = blockOf(span(100, 100.2, 'awake'), FRAME);
    expect(sliver.width).toBe(2);
    expect(sliver.radius).toBe(1);
    expect(blockOf(span(20, 80, 'deep'), FRAME).radius).toBe(4);
  });

  it('keeps a 2 px gap between neighbours', () => {
    const first = blockOf(span(0, 20, 'light'), FRAME);
    const second = blockOf(span(20, 80, 'deep'), FRAME);
    expect(second.x - (first.x + first.width)).toBeCloseTo(2);
  });

  it('places a neutral asleep span in the light lane', () => {
    expect(laneCentre(FRAME, 'asleep')).toBe(laneCentre(FRAME, 'light'));
  });
});

describe('connectors', () => {
  it('joins consecutive spans in different lanes at the end of the first', () => {
    const links = connectorsOf(NIGHT, FRAME);
    expect(links).toHaveLength(5);
    expect(links[0]).toEqual({
      x: 44 + (20 / 480) * 300,
      from: laneCentre(FRAME, 'light'),
      to: laneCentre(FRAME, 'deep'),
    });
  });

  it('skips neighbours in the same lane', () => {
    expect(connectorsOf([span(0, 10, 'rem'), span(10, 20, 'rem')], FRAME)).toEqual([]);
  });
});

describe('one-stage night', () => {
  const unstaged = [span(0, 480, 'asleep')];

  it('is recognised only when every span is asleep', () => {
    expect(isUnstaged(unstaged)).toBe(true);
    expect(isUnstaged([span(0, 10, 'asleep'), span(10, 20, 'deep')])).toBe(false);
    expect(isUnstaged([])).toBe(false);
  });

  it('draws one band capped at 40 px, centred in the plot', () => {
    const band = bandOf(FRAME);
    expect(band.height).toBe(40);
    expect(band.y).toBe((FRAME.plotHeight - 40) / 2);
    expect(band.x).toBe(44);
    expect(band.width).toBe(300);
  });

  it('shrinks the band to fit a short compact plot', () => {
    const small = frameOf({
      window: FRAME.window,
      width: 300,
      height: 30,
      compact: true,
      markers: false,
    });
    expect(bandOf(small).height).toBe(22);
  });

  it('summarises without stage figures', () => {
    expect(plain(summaryOf(unstaged, 'Sleep stages'))).toBe(
      'Sleep stages, 11:00 PM to 7:00 AM. Asleep 8h 00m. Stages were not recorded.',
    );
  });
});

describe('ghost line', () => {
  it('steps horizontally then vertically, never diagonally', () => {
    const path = ghostPath(FRAME);
    const points = [...path.matchAll(/([ML])([\d.]+) ([\d.]+)/g)].map((match) => ({
      command: match[1],
      x: Number(match[2]),
      y: Number(match[3]),
    }));
    expect(points[0]?.command).toBe('M');
    expect(points).toHaveLength(1 + (GHOST_STEPS.length - 1) * 2);
    points.slice(1).forEach((point, index, rest) => {
      const before = index === 0 ? points[0] : rest[index - 1];
      const sameColumn = point.x === before?.x;
      const sameRow = point.y === before?.y;
      expect(sameColumn || sameRow).toBe(true);
    });
  });
});

describe('readout', () => {
  it('names the stage, the clock range and the length', () => {
    expect(plain(readoutOf(span(176, 202, 'rem')).text)).toBe('REM · 1:56 – 2:22 AM · 26m');
  });

  it('keeps both halves of the day when the span crosses noon or midnight', () => {
    expect(plain(readoutOf(span(40, 80, 'deep')).text)).toBe('Deep · 11:40 PM – 12:20 AM · 40m');
  });

  it('finds the span under a moment and falls back to the last one past the end', () => {
    expect(spanAt(NIGHT, at(30))?.stage).toBe('deep');
    expect(spanAt(NIGHT, at(80))?.stage).toBe('awake');
    expect(spanAt(NIGHT, at(9000))).toBe(NIGHT[5]);
    expect(spanAt([], at(0))).toBeNull();
  });
});

describe('stepping', () => {
  it('moves through the spans in time order from the middle of each', () => {
    const first = stepAt(NIGHT, null, 1);
    expect(first).toBe(at(10));
    const second = stepAt(NIGHT, first, 1);
    expect(spanAt(NIGHT, second ?? 0)?.stage).toBe('deep');
    expect(stepAt(NIGHT, second, -1)).toBe(at(10));
  });

  it('starts from the last span when stepping back with nothing selected', () => {
    expect(stepAt(NIGHT, null, -1)).toBe((at(176) + at(480)) / 2);
  });

  it('stops at both ends and does nothing without spans', () => {
    const last = stepAt(NIGHT, null, -1);
    expect(stepAt(NIGHT, last, 1)).toBe(last);
    expect(stepAt(NIGHT, at(10), -1)).toBe(at(10));
    expect(stepAt([], null, 1)).toBeNull();
  });
});

describe('summary label', () => {
  it('counts the wakes, names the longest and lists every stage', () => {
    expect(plain(summaryOf(NIGHT, 'Sleep stages'))).toBe(
      'Sleep stages, 11:00 PM to 7:00 AM. 1 time awake, longest 10 minutes. Deep 1h 00m, Light 6h 24m, REM 26m, Awake 10m.',
    );
  });

  it('says so when nothing was awake and when nothing was recorded', () => {
    expect(plain(summaryOf([span(0, 60, 'deep'), span(60, 120, 'light')], 'Nap'))).toContain(
      'No time awake. Deep 1h 00m, Light 1h 00m, REM 0m, Awake 0m.',
    );
    expect(summaryOf([], 'Sleep stages')).toBe('Sleep stages: no sleep recorded.');
  });

  it('pluralises the wake count', () => {
    const wakes = [
      span(0, 30, 'light'),
      span(30, 31, 'awake'),
      span(31, 90, 'rem'),
      span(90, 95, 'awake'),
    ];
    expect(summaryOf(wakes, 'Night')).toContain('2 times awake, longest 5 minutes.');
  });
});
