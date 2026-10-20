import {
  BRUSH_MODE_LABELS,
  DEFAULT_GOAL,
  computeBrushingStats,
  type BrushingSession,
  type BrushingStats,
  type StatsRange,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { percent } from '../../../format/number';
import { INTENSITY_LABEL } from './brush-model';
import { monthCalendar, heatGrid, heatSummary } from './calendar-model';
import { sessionOf } from './fixtures';
import { colourFrom } from './mode-colour';
import { ORALB_MODE_COLOUR } from './oralb-mode-colour';
import { MODE_COLOUR } from '../../sonicare/model/mode-colour';
import {
  barsLabel,
  bucketLabel,
  completion,
  deltaText,
  deltaTone,
  durationTrend,
  excessLabel,
  excessTrend,
  goalDots,
  intensityMix,
  kpisOf,
  modeMix,
  niceMinutes,
  radialBins,
  recordsOf,
  sessionBars,
  trendLabel,
  zoneBars,
} from './stats-model';

const TODAY = '2026-10-18';

function brushed(
  id: string,
  startedAt: string,
  values: Partial<BrushingSession> = {},
): BrushingSession {
  return sessionOf({ id, startedAt, personId: 'sam', zones: [20, 20, 20, 20, 20, 20], ...values });
}

function statsOf(range: StatsRange, sessions: readonly BrushingSession[]): BrushingStats {
  return computeBrushingStats({ sessions, goal: DEFAULT_GOAL, range, anchor: TODAY, today: TODAY });
}

const WEEK: readonly BrushingSession[] = [
  brushed('mon-am', '2026-10-12T07:00:00Z'),
  brushed('mon-pm', '2026-10-12T21:00:00Z', { mode: 'white_plus', intensity: 'high' }),
  brushed('tue-am', '2026-10-13T07:00:00Z', { durationS: 60, complete: false }),
  brushed('sun-pm', '2026-10-18T21:00:00Z'),
];

describe('the bars of brushes per day', () => {
  const chart = sessionBars(statsOf('week', WEEK));

  it('stacks the morning and the evening of each day', () => {
    expect(chart.bars).toHaveLength(7);
    expect(chart.bars[0]).toMatchObject({ label: 'M', morning: 1, evening: 1, other: 0 });
    expect(chart.bars[1]).toMatchObject({ morning: 1, evening: 0 });
  });

  it('draws the goal line and the seven day average for a week', () => {
    expect(chart.goal).toBe(2);
    expect(chart.average).toHaveLength(7);
    expect(chart.peak).toBeGreaterThanOrEqual(2);
  });

  it('draws no goal line for a day or a year', () => {
    expect(sessionBars(statsOf('day', WEEK)).goal).toBe(0);
    expect(sessionBars(statsOf('year', WEEK)).goal).toBe(0);
  });

  it('describes the chart in words for a screen reader', () => {
    expect(barsLabel(statsOf('week', WEEK))).toContain('4 in total, goal 2 a day');
  });
});

describe('the average time per brush', () => {
  it('starts and ends on whole minutes around the target', () => {
    const trend = durationTrend(statsOf('week', WEEK));
    expect(trend.min % 60).toBe(0);
    expect(trend.max % 60).toBe(0);
    expect(trend.ticks[0]).toBe(trend.min);
    expect(trend.ticks.at(-1)).toBe(trend.max);
    expect(trend.min).toBeLessThanOrEqual(60);
    expect(trend.max).toBeGreaterThanOrEqual(120);
  });

  it('leaves a gap for a day without brushing', () => {
    const trend = durationTrend(statsOf('week', WEEK));
    expect(trend.points[2]?.seconds).toBeNull();
    expect(trend.points[0]?.seconds).toBe(120);
  });

  it('rounds the scale to ticks in whole minutes', () => {
    expect(niceMinutes(70, 130)).toEqual({ min: 60, max: 180, ticks: [60, 120, 180] });
  });

  it('describes the trend with its target', () => {
    expect(trendLabel(statsOf('week', WEEK))).toContain('2:00');
  });
});

describe('whole routines', () => {
  it('counts the routines that were brushed to the end', () => {
    const donut = completion(statsOf('week', WEEK));
    expect(donut.detail).toBe('3 of 4 brushed the whole routine');
    expect(donut.label).toBe(percent(0.75));
  });

  it('says there are no sessions rather than showing a percentage', () => {
    expect(completion(statsOf('week', [])).label).toBe('No sessions');
  });
});

describe('when the person brushes', () => {
  it('gives one bin per hour and colours it by the morning and evening windows', () => {
    const bins = radialBins(statsOf('week', WEEK));
    expect(bins).toHaveLength(24);
    expect(bins[7]).toMatchObject({ value: 2, part: 'morning' });
    expect(bins[21]).toMatchObject({ value: 2, part: 'evening' });
    expect(bins[14]?.part).toBe('other');
  });
});

describe('the mixes', () => {
  it('shows each mode that was used with its share and a colour of its own', () => {
    const segments = modeMix(statsOf('week', WEEK), BRUSH_MODE_LABELS, colourFrom(MODE_COLOUR));
    expect(segments.map((segment) => segment.key)).toEqual(['clean', 'white_plus']);
    expect(segments[0]?.share).toBeCloseTo(0.75);
    expect(new Set(segments.map((segment) => segment.colour)).size).toBe(2);
  });

  it('colours the Oral-B modes from the Oral-B palette', () => {
    const segments = modeMix(
      statsOf('week', [
        brushed('o1', '2026-10-12T07:00:00Z', { mode: 'daily_clean' }),
        brushed('o2', '2026-10-13T07:00:00Z', { mode: 'gum_care' }),
      ]),
      BRUSH_MODE_LABELS,
      colourFrom(ORALB_MODE_COLOUR),
    );
    expect(segments.map((segment) => segment.colour)).toEqual([
      ORALB_MODE_COLOUR.daily_clean,
      ORALB_MODE_COLOUR.gum_care,
    ]);
  });

  it('shows the intensity as one hue that gets stronger', () => {
    const segments = intensityMix(statsOf('week', WEEK), INTENSITY_LABEL);
    expect(new Set(segments.map((segment) => segment.colour))).toEqual(new Set(['primary']));
    const opacities = segments.map((segment) => segment.opacity);
    expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
  });
});

describe('zones', () => {
  it('draws one bar per zone from zero and names the one that gets the least time', () => {
    const uneven = brushed('uneven', '2026-10-14T07:00:00Z', { zones: [40, 40, 40, 40, 40, 10] });
    const model = zoneBars(statsOf('week', [uneven]), 6);
    expect(model.bars.map((bar) => bar.name)).toEqual([
      'Upper left',
      'Upper front',
      'Upper right',
      'Lower right',
      'Lower front',
      'Lower left',
    ]);
    expect(model.bars[0]?.share).toBeGreaterThan(0.9);
    expect(model.least).toBe('Lower left');
  });

  it('has no bars for a handle without zones', () => {
    expect(zoneBars(statsOf('week', WEEK), 0).bars).toEqual([]);
  });
});

describe('pressure', () => {
  it('shows the share of time pressing too hard per period and says so in words', () => {
    const pressed = brushed('pressed', '2026-10-14T07:00:00Z', {
      pressure: {
        excessS: 30,
        optimalS: 90,
        strip: Array.from({ length: 120 }, (_, second) => (second < 30 ? 2 : 1)),
      },
    });
    const points = excessTrend(statsOf('week', [pressed]));
    expect(points.find((point) => point.share !== null)?.share).toBeCloseTo(0.25);
    expect(excessLabel(points)).toContain(percent(0.25));
  });

  it('says there are no readings without a pressure sensor', () => {
    expect(excessLabel(excessTrend(statsOf('week', WEEK)))).toBe('No pressure readings yet');
  });
});

describe('records and key figures', () => {
  it('lists the longest session, the best week and the streaks', () => {
    const labels = recordsOf(statsOf('week', WEEK)).map((record) => record.label);
    expect(labels).toEqual(['Longest session', 'Best week', 'Best streak', 'Streak now']);
  });

  it('compares the figures with the period before', () => {
    const kpis = kpisOf(statsOf('week', WEEK));
    expect(kpis.map((kpi) => kpi.label)).toEqual([
      'Brushes',
      'Average',
      'Whole routine',
      'Goal days',
    ]);
    expect(kpis[0]?.value).toBe('4');
  });

  it('words a change in percent', () => {
    expect(deltaText(null)).toBe('New');
    expect(deltaText(0.2)).toBe('Same');
    expect(deltaText(40)).toBe('+40%');
    expect(deltaText(-12.4)).toBe('−12%');
    expect(deltaTone(null)).toBe('neutral');
    expect(deltaTone(10)).toBe('positive');
    expect(deltaTone(-10)).toBe('warning');
  });

  it('marks the last seven days that reached the goal', () => {
    const dots = goalDots(statsOf('week', WEEK));
    expect(dots).toHaveLength(7);
  });
});

describe('labels along the axis', () => {
  it('uses weekday letters for a week, day numbers for a month and months for a year', () => {
    expect(bucketLabel('week', '2026-10-12')).toBe('M');
    expect(bucketLabel('month', '2026-10-05')).toBe('5');
    expect(bucketLabel('year', '2026-03')).toBe('M');
  });
});

describe('the calendar', () => {
  it('lays the month out in Monday first rows with a ring that fills toward the goal', () => {
    const cells = monthCalendar(statsOf('month', WEEK));
    expect(cells[0]).toMatchObject({ day: '2026-10-01', column: 3, row: 0 });
    const monday = cells.find((cell) => cell.day === '2026-10-12');
    expect(monday?.progress).toBe(1);
    expect(cells.find((cell) => cell.day === '2026-10-13')).toMatchObject({
      progress: 0,
      sessions: 1,
    });
  });

  it('places a year of days in week columns and summarises it', () => {
    const grid = heatGrid(statsOf('year', WEEK));
    expect(grid.weeks).toBeGreaterThan(40);
    expect(grid.cells.every((cell) => cell.row >= 0 && cell.row < 7)).toBe(true);
    expect(heatSummary(grid)).toContain('goal days');
  });
});
