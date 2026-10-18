import { describe, expect, it } from 'vitest';
import type { PhoneDetail } from '@smarteverything/domain';
import { countEntriesOf, countSpoken, groupsOf, rowsOf } from './notifications-model';

type Section = NonNullable<PhoneDetail['notifications']>;

function section(overrides: Partial<Section> = {}): Section {
  return {
    count: 6,
    apps: [
      { package: 'com.mail', label: 'Gmail', count: 1 },
      { package: 'com.chat', label: 'WhatsApp', count: 4 },
      { package: 'com.sms', label: 'Messages', count: 1 },
    ],
    items: [
      { key: 'k1', package: 'com.chat', title: 'Sam', at: '2026-10-18T10:00:00.000Z' },
      { key: 'k2', package: 'com.chat', title: null, at: '2026-10-18T11:00:00.000Z' },
      { key: 'k3', package: 'com.mail', title: 'Your package', at: '2026-10-18T09:00:00.000Z' },
    ],
    at: '2026-10-18T14:00:00.000Z',
    ...overrides,
  };
}

describe('notification counts per app', () => {
  it('ranks apps by count and sizes the bars against the busiest', () => {
    const entries = countEntriesOf(section());
    expect(entries.map((entry) => [entry.label, entry.count, entry.share])).toEqual([
      ['WhatsApp', 4, 1],
      ['Gmail', 1, 0.25],
      ['Messages', 1, 0.25],
    ]);
  });

  it('is empty with no apps', () => {
    expect(countEntriesOf(section({ apps: [] }))).toEqual([]);
  });

  it('speaks the count with the number of apps', () => {
    expect(countSpoken(1, 1)).toBe('1 notification from 1 app');
    expect(countSpoken(6, 3)).toBe('6 notifications from 3 apps');
    expect(countSpoken(2, 0)).toBe('2 notifications');
  });
});

describe('notification titles grouped by app', () => {
  it('puts the busiest app first with its newest title first', () => {
    const groups = groupsOf(section());
    expect(groups.map((group) => group.label)).toEqual(['WhatsApp', 'Gmail', 'Messages']);
    expect(groups[0]?.items.map((item) => item.key)).toEqual(['k2', 'k1']);
  });

  it('has no items when the person did not share titles, but keeps the counts', () => {
    const groups = groupsOf(section({ items: null }));
    expect(groups.map((group) => group.count)).toEqual([4, 1, 1]);
    expect(groups.every((group) => group.items.length === 0)).toBe(true);
  });

  it('drops an app with nothing waiting', () => {
    const groups = groupsOf(
      section({ apps: [{ package: 'com.chat', label: 'WhatsApp', count: 0 }], items: [] }),
    );
    expect(groups).toEqual([]);
  });

  it('flattens to a head then its items for every app', () => {
    const rows = rowsOf(groupsOf(section()));
    expect(
      rows.map((row) => (row.kind === 'group' ? `g:${row.group.package}` : `i:${row.item.key}`)),
    ).toEqual(['g:com.chat', 'i:k2', 'i:k1', 'g:com.mail', 'i:k3', 'g:com.sms']);
  });
});
