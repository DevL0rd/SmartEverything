import { describe, expect, it } from 'vitest';
import {
  DRIVE_ITEM,
  type DriveGrant,
  type DriveItem,
  type DriveShare,
  type DriveSharedByMeEntry,
  type DriveSharedWithMeEntry,
} from '@smarteverything/domain';
import { DAY_MS, HOUR_MS } from '../../../format/time';
import {
  accessLabelOf,
  activeLinksOf,
  byMeLinksOf,
  byMeSubtitleOf,
  endedLabelOf,
  groupEdgeOf,
  linkChipsOf,
  linkEndLabel,
  linkGroupsOf,
  linkStatsOf,
  personChipsOf,
  personLabelOf,
  sharedAgoOf,
  sharedViewOf,
  sharerGroupsOf,
  sharerLineOf,
  withMeKeyOf,
  withMeRowsOf,
  withMeSubtitleOf,
} from './shared-model';

const NOW = Date.parse('2026-11-07T12:00:00.000Z');

const ME = '00000000-0000-4000-8000-000000000001';
const SAM = '00000000-0000-4000-8000-000000000002';
const ROBIN = '00000000-0000-4000-8000-000000000003';
const ROOT = '00000000-0000-4000-8000-000000000300';
const PROFILES = [
  { id: SAM, name: 'Sam' },
  { id: ROBIN, name: 'Robin' },
];

const at = (offset: number): string => new Date(NOW + offset).toISOString();

function share(id: number, extra: Partial<DriveShare> = {}): DriveShare {
  return {
    id: `00000000-0000-4000-8000-0000000001${String(id).padStart(2, '0')}`,
    itemId: itemId(1),
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

function itemId(id: number): string {
  return `00000000-0000-4000-8000-0000000002${String(id).padStart(2, '0')}`;
}

function folder(id: number, name: string): DriveItem {
  return DRIVE_ITEM.parse({
    kind: 'folder',
    id: itemId(id),
    rootId: ROOT,
    parentId: null,
    relPath: name,
    name,
    modifiedAt: at(-DAY_MS),
    addedAt: at(-DAY_MS),
    openedAt: null,
    starred: false,
    shared: true,
    rev: 1,
    etag: 'e',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    childCount: 2,
    bytes: 10,
  });
}

function grant(id: number, item: number, by: string, ago: number): DriveGrant {
  return {
    id: `00000000-0000-4000-8000-0000000004${String(id).padStart(2, '0')}`,
    itemId: itemId(item),
    profileId: ME,
    role: id % 2 === 0 ? 'edit' : 'view',
    grantedBy: by,
    createdAt: at(-ago),
  };
}

function withMe(id: number, by: string, ago: number): DriveSharedWithMeEntry {
  return { item: folder(id, `Folder ${String(id)}`), grant: grant(id, id, by, ago) };
}

describe('Shared view', () => {
  it('opens By me only when the param asks for it', () => {
    expect(sharedViewOf('by-me')).toBe('by-me');
    expect(sharedViewOf(null)).toBe('with-me');
    expect(sharedViewOf('links')).toBe('with-me');
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
    expect(endedLabelOf(share(1, { revokedAt: '2026-10-18T09:00:00.000Z' }))).toMatch(/^Stopped /);
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
  });
});

describe('shared with me', () => {
  it('groups items by the person who shared them, newest share first', () => {
    const entries = [withMe(1, SAM, 3 * DAY_MS), withMe(2, ROBIN, HOUR_MS), withMe(3, SAM, DAY_MS)];
    const groups = sharerGroupsOf(entries, PROFILES);
    expect(groups.map((group) => [group.name, group.entries.map((e) => e.item.name)])).toEqual([
      ['Robin', ['Folder 2']],
      ['Sam', ['Folder 3', 'Folder 1']],
    ]);
    expect(sharerGroupsOf([withMe(4, ME, 0)], [])[0]?.name).toBe('A former member');
    expect(sharerLineOf(6)).toBe('shared 6 items');
    expect(sharerLineOf(1)).toBe('shared 1 item');
  });

  it('lays out one head per sharer followed by its rows framed as one card', () => {
    const groups = sharerGroupsOf([withMe(1, SAM, DAY_MS), withMe(3, SAM, 2 * DAY_MS)], PROFILES);
    const rows = withMeRowsOf(groups);
    expect(rows.map(withMeKeyOf)).toEqual([
      `sharer:${SAM}`,
      `item:${grant(1, 1, SAM, 0).id}`,
      `item:${grant(3, 3, SAM, 0).id}`,
    ]);
    expect(rows.map((row) => (row.kind === 'item' ? row.edge : null))).toEqual([
      null,
      'first',
      'last',
    ]);
  });

  it('says how long ago an item was shared and sums the page', () => {
    expect(sharedAgoOf(at(-2 * DAY_MS), NOW)).toBe('Shared 2 d ago');
    expect(withMeSubtitleOf([])).toBe('Nothing shared with you yet');
    expect(withMeSubtitleOf([withMe(1, SAM, 0), withMe(2, ROBIN, 0)])).toBe(
      '2 items · from 2 people',
    );
    expect(withMeSubtitleOf([withMe(1, SAM, 0)])).toBe('1 item · from 1 person');
  });

  it('frames rows by their place in the group', () => {
    expect([groupEdgeOf(0, 1), groupEdgeOf(0, 3), groupEdgeOf(1, 3), groupEdgeOf(2, 3)]).toEqual([
      'only',
      'first',
      'middle',
      'last',
    ]);
  });
});

describe('shared by me', () => {
  const entry: DriveSharedByMeEntry = {
    item: folder(1, 'Taxes'),
    grants: [{ ...grant(2, 1, ME, 0), profileId: SAM }],
    links: [
      share(1, { expiresAt: at(3 * DAY_MS), opens: 4, hasPassword: true }),
      share(2, { revokedAt: at(-DAY_MS), opens: 9 }),
    ],
  };

  it('shows a chip per person with their role and per active link', () => {
    expect(personChipsOf(entry.grants, PROFILES)).toEqual([
      { key: entry.grants[0]?.id, name: 'Sam', role: 'Can edit' },
    ]);
    expect(personChipsOf(entry.grants, [])[0]?.name).toBe('A former member');
    expect(linkChipsOf(entry.links, NOW)).toEqual([
      { key: share(1).id, label: 'Link with password', detail: 'Ends in 3 days · 4 opens' },
    ]);
    expect(activeLinksOf(entry, NOW).map((link) => link.id)).toEqual([share(1).id]);
  });

  it('sums the shared items and their active links', () => {
    const groups = linkGroupsOf(byMeLinksOf([entry]), NOW);
    expect(byMeSubtitleOf(1, groups)).toBe('1 item · 1 active link');
    expect(byMeSubtitleOf(0, linkGroupsOf([], NOW))).toBe('You have not shared anything yet');
  });

  it('names a person as You for the viewer', () => {
    expect(personLabelOf(ME, ME, PROFILES)).toBe('You');
    expect(personLabelOf(SAM, ME, PROFILES)).toBe('Sam');
    expect(personLabelOf(ROBIN, ME, [])).toBe('A former member');
  });
});
