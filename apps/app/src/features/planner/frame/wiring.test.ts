import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  sectionCountOf,
  sectionCountsOf,
  targetCountOf,
  type TargetFacts,
} from '../../../app-shell/nav-targets';
import { EntityStore } from '../../../store/entity-store';
import { FEATURE_NOTICES } from '../../../store/live-feature-notices';
import { noticeRouter } from '../../../store/notice-registry';
import { plannerSummaries, summaryOf } from '../data/summary';
import { missedCountOf } from './missed-count';

const ANA = 'a1b2c3d4-0000-4000-8000-000000000011';

const FACTS: TargetFacts = { exists: true, title: 'Kitchen bottle', icon: 'info', count: 3 };

describe('the planner nav count', () => {
  it('reads the missed count from the planner summary and hides zero', () => {
    const summary = { personId: ANA, missed: 2, left: 5, nextAlarmAt: null, runningTimers: 0 };
    expect(missedCountOf(summary)).toBe(2);
    expect(missedCountOf(null)).toBe(0);
    const counts = sectionCountsOf([
      ['assistant', 4],
      ['planner', 2],
    ]);
    expect(sectionCountOf(counts, 'planner')).toBe(2);
    expect(sectionCountOf(counts, 'assistant')).toBe(4);
    expect(sectionCountsOf([['planner', 0]]).size).toBe(0);
  });

  it('gives every other section no count, the Clock included', () => {
    const counts = sectionCountsOf([['planner', 2]]);
    for (const section of ['home', 'devices', 'fitness', 'clock', 'drive'] as const) {
      expect(sectionCountOf(counts, section)).toBe(0);
    }
  });

  it('counts a pinned section by its section and any other pin by its own facts', () => {
    const counts = sectionCountsOf([['planner', 2]]);
    expect(targetCountOf({ kind: 'section', section: 'planner' }, undefined, counts)).toBe(2);
    expect(targetCountOf({ kind: 'section', section: 'clock' }, undefined, counts)).toBe(0);
    const room = { kind: 'room', roomId: ANA } as const;
    expect(targetCountOf(room, FACTS, counts)).toBe(3);
    expect(targetCountOf(room, undefined, counts)).toBe(0);
  });
});

describe('the planner notices', () => {
  it('reach the summary through the feature notices', () => {
    const route = noticeRouter(FEATURE_NOTICES, {
      client: new QueryClient(),
      store: new EntityStore(),
    });
    const routed = route(
      {
        type: 'planner_summary',
        personId: ANA,
        missed: 3,
        left: 1,
        nextAlarmAt: null,
        runningTimers: 0,
      },
      true,
    );
    expect(routed).toBe(true);
    expect(summaryOf(plannerSummaries.get(), ANA)?.missed).toBe(3);
  });
});

describe('the planner pages', () => {
  it('load every page, the item screen and the feature entry', async () => {
    const [today, tasks, calendar, insights, item, feature, routes] = await Promise.all([
      import('../today/today-page'),
      import('../tasks/tasks-page'),
      import('../calendar/calendar-page'),
      import('../insights/insights-page'),
      import('../item'),
      import('..'),
      import('../routes'),
    ]);
    expect(typeof today.TodayPage).toBe('function');
    expect(typeof tasks.TasksPage).toBe('function');
    expect(typeof calendar.CalendarPage).toBe('function');
    expect(typeof insights.InsightsPage).toBe('function');
    expect(typeof item.ItemScreen).toBe('function');
    expect(typeof feature.PlannerFrame).toBe('function');
    expect(typeof feature.QuickAddBar).toBe('function');
    expect(routes.ROUTES.map((route) => route.href)).toEqual([
      '/planner/tasks',
      '/planner/calendar',
      '/planner/insights',
    ]);
  });
});
