import { describe, expect, it } from 'vitest';
import { statsOf, TODAY } from './fixtures';
import {
  bodyHeightOf,
  faceKindOf,
  goalsMetLine,
  monthLine,
  monthTotalMl,
  shortLitres,
} from './widget-model';

describe('widget model', () => {
  it('picks a strip for small frames, a row for wide ones and a panel for tall ones', () => {
    expect(faceKindOf('xs')).toBe('strip');
    expect(faceKindOf('s')).toBe('strip');
    expect(faceKindOf('m')).toBe('strip');
    expect(faceKindOf('w')).toBe('row');
    expect(faceKindOf('l')).toBe('panel');
    expect(faceKindOf('xl')).toBe('panel');
  });

  it('leaves the widget header out of the body height', () => {
    expect(bodyHeightOf({ width: 348, height: 140, idiom: 'touch' })).toBe(88);
    expect(bodyHeightOf({ width: 542, height: 120, idiom: 'pointer' })).toBe(76);
    expect(bodyHeightOf({ width: 100, height: 20, idiom: 'pointer' })).toBe(0);
  });

  it('adds up only the days of the current month', () => {
    const heatmap = [
      { day: '2026-09-30', ml: 1000, goalMl: 2600 },
      { day: '2026-10-01', ml: 2000, goalMl: 2600 },
      { day: TODAY, ml: 500, goalMl: 2600 },
    ];
    expect(monthTotalMl(heatmap, TODAY)).toBe(2500);
    expect(monthLine(statsOf().heatmap, TODAY).replaceAll(' ', ' ')).toMatch(/ ml this month$/);
  });

  it('counts the days the goal was reached', () => {
    expect(goalsMetLine([true, false, true])).toBe('Goal reached 2 of the last 3 days');
  });

  it('shows litres from a litre up and millilitres below', () => {
    expect(shortLitres(2600).replaceAll(' ', ' ')).toBe('2.6 L');
    expect(shortLitres(540).replaceAll(' ', ' ')).toBe('540 ml');
  });
});
