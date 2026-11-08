import { describe, expect, it } from 'vitest';
import type { DriveShare } from '@smarteverything/domain';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import {
  accessLabelOf,
  albumLineOf,
  endedLabelOf,
  groupEdgeOf,
  homeScopedOf,
  homeSubtitleOf,
  linkDensityOf,
  linkEndLabel,
  linkGroupsOf,
  linkItemOf,
  linkListRowsOf,
  linkRowKeyOf,
  linkStatsOf,
  linkSubtitleOf,
  linksScopeOf,
  linksSubtitleOf,
  personLabelOf,
  rootAccessOf,
  rootLineOf,
  sharedViewOf,
} from './shared-model';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');

const ME = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';

function share(id: number, extra: Partial<DriveShare> = {}): DriveShare {
  return {
    id: `00000000-0000-4000-8000-0000000001${String(id).padStart(2, '0')}`,
    itemId: '00000000-0000-4000-8000-000000000200',
    permission: 'view',
    expiresAt: null,
    hasPassword: false,
    createdBy: ME,
    revokedAt: null,
    opens: 0,
    downloads: 0,
    lastOpenedAt: null,
    ...extra,
  };
}

const at = (offset: number): string => new Date(NOW + offset).toISOString();

describe('Shared view', () => {
  it('opens Links only when the param asks for it', () => {
    expect(sharedViewOf('links')).toBe('links');
    expect(sharedViewOf(null)).toBe('home');
    expect(sharedViewOf('home')).toBe('home');
  });
});

describe('link groups', () => {
  it('moves revoked and expired links out of the active list', () => {
    const active = share(1, { expiresAt: at(DAY_MS) });
    const revoked = share(2, { revokedAt: at(-DAY_MS) });
    const expired = share(3, { expiresAt: at(-HOUR_MS) });
    const groups = linkGroupsOf([active, revoked, expired], NOW);
    expect(groups.active).toEqual([active]);
    expect(groups.ended).toEqual([revoked, expired]);
  });

  it('says when a link ends in the access words of the design', () => {
    expect(accessLabelOf('view')).toBe('View');
    expect(accessLabelOf('download')).toBe('View and download');
    expect(linkEndLabel(share(1), NOW)).toBe('No end');
    expect(linkEndLabel(share(1, { expiresAt: at(30 * 60_000) }), NOW)).toBe(
      'Ends within the hour',
    );
    expect(linkEndLabel(share(1, { expiresAt: at(5 * HOUR_MS) }), NOW)).toBe('Ends in 5 hours');
    expect(linkEndLabel(share(1, { expiresAt: at(DAY_MS + HOUR_MS) }), NOW)).toBe('Ends in 1 day');
  });

  it('names how an ended link ended', () => {
    expect(endedLabelOf(share(1, { revokedAt: '2026-10-18T09:00:00.000Z' }))).toMatch(/^Revoked /);
    expect(endedLabelOf(share(1, { expiresAt: '2026-11-02T09:00:00.000Z' }))).toMatch(/^Ended /);
  });
});

describe('link stats', () => {
  it('counts active links, links ending this week, opens and downloads over every link', () => {
    const groups = linkGroupsOf(
      [
        share(1, { expiresAt: at(2 * DAY_MS), opens: 14, downloads: 2 }),
        share(2, { expiresAt: at(20 * DAY_MS), opens: 3 }),
        share(3, { revokedAt: at(-DAY_MS), opens: 6, downloads: 1 }),
      ],
      NOW,
    );
    const stats = linkStatsOf(groups, NOW);
    expect(stats.map((item) => [item.key, item.value, item.caption])).toEqual([
      ['active', '2', '1 ends this week'],
      ['opens', '23', '3 downloads'],
      ['last-open', 'Not yet', undefined],
      ['ended', '1', undefined],
    ]);
    expect(linksSubtitleOf(groups)).toBe('2 active links · 23 opens');
  });

  it('tells the owner and a member whose links they see', () => {
    expect(linksScopeOf(true)).toBe('You see every link in the home.');
    expect(linksScopeOf(false)).toBe('You see the links you made.');
  });
});

describe('link rows', () => {
  it('keeps ended links behind one toggle and frames each group as one card', () => {
    const groups = linkGroupsOf([share(1), share(2), share(3, { revokedAt: at(-DAY_MS) })], NOW);
    const closed = linkListRowsOf(groups, false);
    expect(closed.map(linkRowKeyOf)).toEqual([
      `link:${share(1).id}`,
      `link:${share(2).id}`,
      'ended-toggle',
    ]);
    expect(closed.map((row) => (row.kind === 'ended-toggle' ? row.open : row.edge))).toEqual([
      'first',
      'last',
      false,
    ]);
    const open = linkListRowsOf(groups, true);
    expect(open.at(-1)).toEqual({
      kind: 'ended',
      share: share(3, { revokedAt: at(-DAY_MS) }),
      edge: 'only',
    });
    expect(linkListRowsOf(linkGroupsOf([], NOW), true)).toEqual([]);
  });

  it('frames rows by their place in the group', () => {
    expect([groupEdgeOf(0, 1), groupEdgeOf(0, 3), groupEdgeOf(1, 3), groupEdgeOf(2, 3)]).toEqual([
      'only',
      'first',
      'middle',
      'last',
    ]);
  });

  it('moves the columns that do not fit into the subtitle', () => {
    const link = share(1, { hasPassword: true, opens: 2 });
    const lines = { by: 'Sam', end: 'No end', place: 'Projects › Home' };
    expect(linkDensityOf(true, false)).toBe('compact');
    expect(linkDensityOf(false, false)).toBe('medium');
    expect(linkDensityOf(false, true)).toBe('wide');
    expect(linkSubtitleOf(link, lines, 'wide')).toBe('Projects › Home');
    expect(linkSubtitleOf(link, lines, 'medium')).toBe('Projects › Home · by Sam · No end');
    expect(linkSubtitleOf(link, lines, 'compact')).toBe(
      'View · Password · 2 opens · 0 downloads · No end · by Sam',
    );
    expect(linkSubtitleOf(link, { ...lines, place: null }, 'wide')).toBeUndefined();
  });

  it('names the maker and the shared item with its place', () => {
    const profiles = [{ id: SAM, name: 'Sam' }];
    expect(personLabelOf(ME, ME, profiles)).toBe('You');
    expect(personLabelOf(SAM, ME, profiles)).toBe('Sam');
    expect(personLabelOf(SAM, ME, [])).toBe('A former member');
    const roots = [{ id: 'root-1', label: 'Projects' }];
    const budget = {
      kind: 'document',
      name: 'Budget 2027.xlsx',
      rootId: 'root-1',
      relPath: 'Home/Finance/Budget 2027.xlsx',
    } as const;
    expect(linkItemOf(budget, roots)).toEqual({
      title: 'Budget 2027.xlsx',
      icon: 'fileText',
      place: 'Projects › Home › Finance',
    });
    expect(linkItemOf({ ...budget, kind: 'folder', relPath: 'Tax 2026' }, [])).toEqual({
      title: 'Budget 2027.xlsx',
      icon: 'folder',
      place: null,
    });
  });
});

describe('Shared with home', () => {
  it('keeps only what everyone in the home can use', () => {
    const rows = [
      { id: 'a', scope: 'home' },
      { id: 'b', scope: 'person' },
    ] as const;
    expect(homeScopedOf(rows).map((row) => row.id)).toEqual(['a']);
  });

  it('describes a library folder with its size, files and the computers it syncs to', () => {
    const root = { id: 'root-1', bytes: 0, items: 1, synced: true };
    const clients = [
      { rootId: 'root-1', deviceId: 'pc-1', enabled: true },
      { rootId: 'root-1', deviceId: 'pc-1', enabled: true },
      { rootId: 'root-1', deviceId: 'pc-2', enabled: false },
      { rootId: 'root-2', deviceId: 'pc-3', enabled: true },
    ];
    expect(rootLineOf(root, clients)).toMatch(/ · 1 file · synced to 1 computer$/);
    expect(rootLineOf({ ...root, synced: false }, clients)).not.toContain('synced');
    expect(rootAccessOf({ readOnly: true })).toBe('Can view');
    expect(rootAccessOf({ readOnly: false })).toBe('Can edit');
  });

  it('counts albums and folders in the subtitle', () => {
    expect(albumLineOf({ kind: 'smart', itemCount: 214 })).toBe('Smart album · 214 items');
    expect(albumLineOf({ kind: 'manual', itemCount: 1 })).toBe('Album · 1 item');
    expect(homeSubtitleOf(3, 5)).toBe('3 library folders · 5 albums');
    expect(homeSubtitleOf(1, 0)).toBe('1 library folder');
    expect(homeSubtitleOf(0, 0)).toBe('Nothing shared with the home yet');
  });
});
