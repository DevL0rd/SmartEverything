import type { PhoneDetail } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MOST_TOP_APPS, topAppsOf } from './top-apps';

const WEEK = [0, 0, 0, 0, 0, 0, 0];

function apps(minutes: Record<string, number>): PhoneDetail['apps'] {
  const names = Object.keys(minutes);
  return {
    installedCount: names.length,
    installed: names.map((name) => ({ package: name, label: name.toUpperCase(), iconHash: null })),
    usage: names.map((name) => ({
      package: name,
      minutesToday: minutes[name] ?? 0,
      minutesByDay: WEEK,
      lastUsedAt: null,
    })),
    front: null,
    at: '2026-10-18T10:00:00.000Z',
  };
}

describe('the top apps of today', () => {
  it('lists the most used apps first with a share of the busiest', () => {
    const top = topAppsOf(apps({ a: 20, b: 50, c: 10, d: 30, e: 40, f: 5, g: 15 }));
    expect(top.map((app) => app.package)).toEqual(['b', 'e', 'd', 'a', 'g']);
    expect(top).toHaveLength(MOST_TOP_APPS);
    expect(top.map((app) => app.share)).toEqual([1, 0.8, 0.6, 0.4, 0.3]);
  });

  it('leaves out apps that were not used today and names a missing app by its package', () => {
    expect(topAppsOf(apps({ a: 0 }))).toEqual([]);
    const section = apps({ a: 5 });
    const stripped = section === undefined ? undefined : { ...section, installed: [] };
    expect(topAppsOf(stripped)[0]?.label).toBe('a');
  });

  it('has nothing before the phone reported its apps', () => {
    expect(topAppsOf(undefined)).toEqual([]);
  });
});
