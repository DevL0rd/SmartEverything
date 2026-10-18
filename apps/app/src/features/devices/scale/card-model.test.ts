import { describe, expect, it } from 'vitest';
import {
  EMPTY_LINE,
  readingsLabel,
  scaleActions,
  scaleLine,
  scaleSummary,
  scaleTicker,
} from './card-model';
import { NOW, daysAgo, hoursAgo, readingOf } from '../../../store/body-fixture';
import { factsOf, weighInsOf } from './weigh-ins';

const when = (iso: string, stale: boolean): string =>
  stale ? `date ${iso.slice(0, 10)}` : 'Today 06:53';

function factsFor(...readings: Parameters<typeof readingOf>[0][]): ReturnType<typeof factsOf> {
  return factsOf(weighInsOf(readings.map(readingOf)), NOW);
}

describe('the line under the title', () => {
  it('asks the person to step on the scale when there is nothing yet', () => {
    expect(scaleLine(factsOf([], NOW), when)).toEqual({ text: EMPTY_LINE, tone: 'variant' });
  });

  it('gives the day and the change over the week', () => {
    const facts = factsFor(
      { weight_kg: 88.8, measured_at: daysAgo(5) },
      { weight_kg: 87.9, measured_at: hoursAgo(3) },
    );
    expect(scaleLine(facts, when).text).toBe('Today 06:53 · −0.9 kg this week');
  });

  it('warns that an outlier is not counted', () => {
    const facts = factsFor(
      { weight_kg: 88, measured_at: daysAgo(4) },
      { weight_kg: 204.7, measured_at: daysAgo(1) },
    );
    expect(scaleLine(facts, when)).toEqual({
      text: '204.7 kg looks off · not counted',
      tone: 'warning',
    });
  });

  it('names the date of a stale weigh-in', () => {
    const facts = factsFor({ weight_kg: 88, measured_at: daysAgo(20) });
    expect(scaleLine(facts, when).text).toBe(`Last weigh-in date ${daysAgo(20).slice(0, 10)}`);
  });
});

describe('the actions and ticker', () => {
  it('queues the readings that need a person ahead of Not me', () => {
    const facts = factsFor({
      weight_kg: 88,
      measured_at: hoursAgo(0.5),
    });
    expect(scaleActions(facts, 2)).toEqual([
      { kind: 'queue', label: 'Assign 2 readings', filled: true },
      { kind: 'one', label: 'Not me?', filled: false },
    ]);
    expect(scaleTicker(facts, 2)).toBe('2 need a person');
  });

  it('fills Not me on an outlier and ticks Not counted', () => {
    const facts = factsFor(
      { weight_kg: 88, measured_at: daysAgo(4) },
      { weight_kg: 10.1, measured_at: daysAgo(3) },
    );
    expect(scaleActions(facts, 0)).toEqual([{ kind: 'one', label: 'Not me?', filled: true }]);
    expect(scaleTicker(facts, 0)).toBe('Not counted');
  });

  it('offers nothing a day after a normal weigh-in', () => {
    const facts = factsFor({ weight_kg: 88, measured_at: daysAgo(1) });
    expect([scaleActions(facts, 0), scaleTicker(facts, 0)]).toEqual([[], null]);
  });

  it('says one reading in the singular', () => {
    expect(readingsLabel(1)).toBe('1 reading needs a person');
    expect(readingsLabel(2)).toBe('2 readings need a person');
  });
});

describe('the spoken summary', () => {
  it('carries the weight, the line and the waiting readings', () => {
    const facts = factsFor({ weight_kg: 87.9, measured_at: hoursAgo(3) });
    expect(scaleSummary('Body scale', facts, 'Today 06:53', 1)).toBe(
      'Body scale, 87.9 kilograms, Today 06:53, 1 reading needs a person',
    );
  });
});
