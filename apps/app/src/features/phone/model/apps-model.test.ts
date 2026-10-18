import { describe, expect, it } from 'vitest';
import type { PhoneDetail } from '@smarteverything/domain';
import { DAY_MS, weekdayShort } from '../../../format/time';
import {
  appRowsOf,
  matchingApps,
  todayAppsOf,
  todayKeyOf,
  weekBarsOf,
  type AppRow,
} from './apps-model';

type AppsSection = NonNullable<PhoneDetail['apps']>;

const WEEK = [0, 0, 0, 0, 0, 0, 0];

function section(overrides: Partial<AppsSection> = {}): AppsSection {
  return {
    installedCount: 4,
    installed: [
      { package: 'com.a', label: 'Chrome', iconHash: null },
      { package: 'com.b', label: 'YouTube', iconHash: 'h'.repeat(64) },
      { package: 'com.c', label: 'Bitwarden', iconHash: null },
      { package: 'com.d', label: 'Camera', iconHash: null },
    ],
    usage: [
      {
        package: 'com.a',
        minutesToday: 52,
        minutesByDay: [1, 2, 3, 4, 5, 6, 52],
        lastUsedAt: '2026-10-18T10:00:00.000Z',
      },
      {
        package: 'com.b',
        minutesToday: 38,
        minutesByDay: WEEK,
        lastUsedAt: '2026-10-18T09:00:00.000Z',
      },
      {
        package: 'com.d',
        minutesToday: 0,
        minutesByDay: WEEK,
        lastUsedAt: '2026-10-17T09:00:00.000Z',
      },
    ],
    front: null,
    at: '2026-10-18T14:00:00.000Z',
    ...overrides,
  };
}

describe('the phone apps list', () => {
  it('joins installed apps with their usage, most used first', () => {
    const rows = appRowsOf(section());
    expect(rows.map((row) => row.label)).toEqual(['Chrome', 'YouTube', 'Camera', 'Bitwarden']);
  });

  it('gives an app with no usage record zero minutes and a flat week', () => {
    const bitwarden = appRowsOf(section()).find((row) => row.package === 'com.c');
    expect(bitwarden).toMatchObject({ minutesToday: 0, minutesByDay: WEEK, lastUsedAt: null });
  });

  it('breaks a tie on minutes by the most recent use, then by name', () => {
    const rows = appRowsOf(
      section({
        usage: [
          { package: 'com.c', minutesToday: 5, minutesByDay: WEEK, lastUsedAt: null },
          {
            package: 'com.a',
            minutesToday: 5,
            minutesByDay: WEEK,
            lastUsedAt: '2026-10-18T10:00:00.000Z',
          },
          { package: 'com.b', minutesToday: 5, minutesByDay: WEEK, lastUsedAt: null },
        ],
      }),
    );
    expect(rows.slice(0, 3).map((row) => row.label)).toEqual(['Chrome', 'Bitwarden', 'YouTube']);
  });

  it('keeps apps the phone listed even with no icon yet', () => {
    expect(appRowsOf(section()).find((row) => row.package === 'com.a')?.iconHash).toBeNull();
  });
});

describe('the apps used today', () => {
  it('shows only apps used today, sized against the busiest one', () => {
    const today = todayAppsOf(appRowsOf(section()));
    expect(today.map((app) => [app.label, app.share])).toEqual([
      ['Chrome', 1],
      ['YouTube', 38 / 52],
    ]);
  });

  it('stops at the requested number of apps', () => {
    expect(todayAppsOf(appRowsOf(section()), 1)).toHaveLength(1);
  });

  it('is empty when nothing was used', () => {
    expect(todayAppsOf(appRowsOf(section({ usage: [] })))).toEqual([]);
  });
});

describe('searching apps', () => {
  const rows: readonly AppRow[] = appRowsOf(section());

  it('matches the label without caring about case', () => {
    expect(matchingApps(rows, 'you').map((row) => row.label)).toEqual(['YouTube']);
  });

  it('matches the package name too', () => {
    expect(matchingApps(rows, 'com.c').map((row) => row.label)).toEqual(['Bitwarden']);
  });

  it('returns everything for a blank query and nothing for a miss', () => {
    expect(matchingApps(rows, '   ')).toHaveLength(4);
    expect(matchingApps(rows, 'zzz')).toEqual([]);
  });
});

describe('the week bars', () => {
  const now = Date.parse('2026-10-18T12:00:00.000Z');

  it('labels the last seven days ending today and keys today last', () => {
    const bars = weekBarsOf([1, 2, 3, 4, 5, 6, 7], now);
    expect(bars.map((bar) => bar.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(bars.at(-1)?.label).toBe(weekdayShort(now));
    expect(bars[0]?.label).toBe(weekdayShort(now - 6 * DAY_MS));
    expect(todayKeyOf(WEEK)).toBe(bars.at(-1)?.key);
  });
});
