import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { recordsOfType } from '../model/records';
import { sleepScore } from '../model/scores';
import { nightOf } from '../model/sleep';
import { stageRowsOf } from '../model/sleep-summary';
import { at, seedRecord } from '../model/test-support';

vi.mock('../../../design/colour', () => ({ useColour: (role: string): string => role }));

vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { width: number; onLayout: () => void } => ({
    width: 200,
    onLayout: (): void => undefined,
  }),
}));

vi.mock('../../../components/charts/progress-bar', () => ({
  ProgressBar: (): null => null,
}));

const { StageLegend, StageSummary } = await import('./stage-summary');
const { NapStrip } = await import('./nap-strip');
const { ScoreParts } = await import('./sleep-score-ring');
await import('./night-card');
await import('./sleep-empty');

function stage(start: Date, end: Date, code: number): object {
  return { startTime: start.toISOString(), endTime: end.toISOString(), stage: code };
}

function nightOn(start: Date, end: Date, stages: readonly object[]): ReturnType<typeof nightOf> {
  const [record] = recordsOfType(
    [seedRecord({ type: 'SleepSession', start, end, data: { title: null, notes: null, stages } })],
    'SleepSession',
  );
  return nightOf(record!);
}

const STAGED = nightOn(at(7, 23), at(8, 7), [
  stage(at(7, 23), at(8, 1), 4),
  stage(at(8, 1), at(8, 2, 30), 5),
  stage(at(8, 2, 30), at(8, 3), 1),
  stage(at(8, 3), at(8, 5), 6),
  stage(at(8, 5), at(8, 7), 4),
]);

describe('night card parts', () => {
  it('draws a row per stage with its typical range caption', () => {
    const markup = renderToStaticMarkup(createElement(StageSummary, { rows: stageRowsOf(STAGED) }));
    for (const text of ['Deep', 'Light', 'REM', 'Awake', 'Typical 13–23%', 'Typical under 10%']) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain('left:43.33');
  });

  it('draws nothing for a night without stages', () => {
    const plain = nightOn(at(7, 23), at(8, 7), []);
    expect(renderToStaticMarkup(createElement(StageSummary, { rows: stageRowsOf(plain) }))).toBe(
      '',
    );
  });

  it('names the four stages in the legend', () => {
    const markup = renderToStaticMarkup(createElement(StageLegend));
    expect(markup).toContain('Deep');
    expect(markup).toContain('Awake');
  });

  it('shows a nap with its legend in minutes', () => {
    const nap = nightOn(at(8, 13, 20), at(8, 13, 54), [
      stage(at(8, 13, 20), at(8, 13, 25), 1),
      stage(at(8, 13, 25), at(8, 13, 54), 4),
    ]);
    const markup = renderToStaticMarkup(createElement(NapStrip, { nap }));
    expect(markup).toContain('Nap · 29m asleep');
    expect(markup).toContain('Awake 5m');
    expect(markup).toContain('Light 29m');
  });

  it('lists each score part with what it counts for', () => {
    const score = sleepScore(STAGED, 480);
    const markup = renderToStaticMarkup(
      createElement(ScoreParts, { night: STAGED, score: score! }),
    );
    expect(markup).toContain('Duration');
    expect(markup).toContain('7h 30m of 8h');
    expect(markup).toContain('counts for 50 points');
    expect(markup).toContain('counts for 25 points');
  });
});
