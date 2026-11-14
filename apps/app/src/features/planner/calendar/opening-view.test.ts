import { PLANNER_CALENDAR_VIEWS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { openingViewOf } from './opening-view';

describe('the view the calendar opens in', () => {
  it('opens the preferred view on wide layouts', () => {
    expect(openingViewOf('week', PLANNER_CALENDAR_VIEWS, false)).toBe('week');
    expect(openingViewOf('month', PLANNER_CALENDAR_VIEWS, false)).toBe('month');
  });

  it('opens three days instead of a week on phone widths', () => {
    expect(openingViewOf('week', PLANNER_CALENDAR_VIEWS, true)).toBe('three_days');
    expect(openingViewOf('day', PLANNER_CALENDAR_VIEWS, true)).toBe('day');
    expect(openingViewOf('agenda', PLANNER_CALENDAR_VIEWS, true)).toBe('agenda');
  });

  it('falls back to the week span when the preferred view is not offered', () => {
    const views = PLANNER_CALENDAR_VIEWS.filter((view) => view !== 'people');
    expect(openingViewOf('people', views, false)).toBe('week');
    expect(openingViewOf('people', views, true)).toBe('three_days');
  });
});
