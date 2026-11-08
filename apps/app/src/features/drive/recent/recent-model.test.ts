import { describe, expect, it } from 'vitest';
import {
  DRIVE_ITEM,
  type DriveItem,
  type DriveRecentEntry,
  type DriveVia,
} from '@smarteverything/domain';
import { howOf, type RecentNames } from './recent-how';
import {
  chartShown,
  groupOf,
  linesOf,
  openHrefOf,
  recentDaysOf,
  sectionsOf,
  weekBarsOf,
  weekCovered,
  whereOf,
} from './recent-model';
import { PLOT_HEIGHT, stackShapesOf } from './recent-stack';

const ZONE = 'Europe/Berlin';
const NOW = Date.parse('2026-11-07T15:00:00.000Z');
const AT_NOW = new Date(NOW).toISOString();
const ROOT = 'a1b2c3d4-0000-4000-8000-000000000001';
const FOLDER = 'a1b2c3d4-0000-4000-8000-000000000003';
const ME = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const SAM = 'a1b2c3d4-0000-4000-8000-0000000000a2';
const LAPTOP = 'a1b2c3d4-0000-4000-8000-0000000000d1';

function file(id: string, relPath: string, parentId: string | null): DriveItem {
  return DRIVE_ITEM.parse({
    id,
    rootId: ROOT,
    parentId,
    relPath,
    name: relPath.split('/').at(-1),
    modifiedAt: '2026-11-07T10:00:00.000Z',
    addedAt: '2026-11-07T10:00:00.000Z',
    openedAt: null,
    starred: false,
    rev: 1,
    etag: 'e',
    outside: false,
    addedByProfileId: null,
    remoteId: null,
    remoteRev: null,
    mime: 'application/pdf',
    bytes: 10,
    sha256: null,
    integrity: 'unknown',
    thumb: { state: 'none' },
    kind: 'document',
  });
}

const ITEM = file('a1b2c3d4-0000-4000-8000-000000000010', 'Home/Taxes/Return.pdf', FOLDER);

function written(
  kind: 'added' | 'changed',
  at: string,
  via: DriveVia,
  who: { readonly actor?: string; readonly device?: string } = {},
): DriveRecentEntry {
  return {
    kind,
    item: ITEM,
    at,
    actorProfileId: who.actor ?? null,
    via,
    deviceId: who.device ?? null,
  };
}

const NAMES: RecentNames = {
  me: ME,
  personOf: (id) => (id === SAM ? 'Sam' : null),
  deviceOf: (id) => (id === LAPTOP ? 'Laptop' : null),
};

describe('recent groups', () => {
  const days = recentDaysOf(NOW, ZONE);

  it('puts today, the six days before and everything older in their own group', () => {
    expect(groupOf('2026-11-07T08:00:00.000Z', days)).toBe('today');
    expect(groupOf('2026-11-01T08:00:00.000Z', days)).toBe('week');
    expect(groupOf('2026-10-31T22:30:00.000Z', days)).toBe('earlier');
  });

  it('reads the day in the home time zone', () => {
    expect(groupOf('2026-11-06T23:30:00.000Z', days)).toBe('today');
  });

  it('titles today and this week with their counts and leaves the open-ended group bare', () => {
    const lines = linesOf(
      [
        written('added', '2026-11-07T09:00:00.000Z', 'app', { actor: ME }),
        written('changed', '2026-11-05T09:00:00.000Z', 'app', { actor: ME }),
        written('changed', '2026-11-04T09:00:00.000Z', 'app', { actor: ME }),
        written('added', '2026-10-01T09:00:00.000Z', 'app', { actor: ME }),
      ],
      days,
    );
    expect(sectionsOf(lines).map((section) => section.title)).toEqual([
      'Today · 1',
      'This week · 2',
      'Earlier',
    ]);
  });

  it('knows the week is loaded only once an older entry arrived', () => {
    const week = [written('added', '2026-11-03T09:00:00.000Z', 'app')];
    expect(weekCovered(week, days)).toBe(false);
    expect(weekCovered([...week, written('added', '2026-10-20T09:00:00.000Z', 'app')], days)).toBe(
      true,
    );
  });

  it('counts added and changed per day across the seven days ending today', () => {
    const lines = linesOf(
      [
        written('added', '2026-11-07T09:00:00.000Z', 'app'),
        written('changed', '2026-11-07T08:00:00.000Z', 'outside'),
        written('changed', '2026-11-07T07:00:00.000Z', 'ai'),
        { kind: 'opened', item: ITEM, at: '2026-11-07T06:00:00.000Z' },
        written('added', '2026-11-01T09:00:00.000Z', 'app'),
        written('added', '2026-10-31T09:00:00.000Z', 'app'),
      ],
      days,
    );
    const bars = weekBarsOf(lines, days);
    expect(bars.map((bar) => bar.day)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(bars[0]).toEqual({ day: '2026-11-01', added: 1, changed: 0 });
    expect(bars[6]).toEqual({ day: '2026-11-07', added: 1, changed: 2 });
  });

  it('draws no chart for opened files', () => {
    expect(chartShown('opened')).toBe(false);
    expect(chartShown('everything')).toBe(true);
  });
});

describe('recent stack', () => {
  it('stacks changed above added with a gap and rounds only the top segment', () => {
    const shapes = stackShapesOf([{ day: '2026-11-07', added: 2, changed: 2 }], 100, '#00f');
    const [added, changed] = shapes;
    expect(added?.bottom).toBe(PLOT_HEIGHT - 1);
    expect(added?.radii.top).toBe(0);
    expect(changed?.fill).toBe('#00f');
    expect(changed?.radii.top).toBeGreaterThan(0);
    expect((changed?.bottom ?? 0) < (added?.top ?? 0)).toBe(true);
  });

  it('draws nothing for an empty day', () => {
    expect(stackShapesOf([{ day: '2026-11-07', added: 0, changed: 0 }], 100, '#00f')).toEqual([]);
  });
});

describe('recent rows', () => {
  it('names where the item lives from its library folder and parent folders', () => {
    expect(whereOf(ITEM, 'Media disk')).toBe('Media disk › Home › Taxes');
    expect(whereOf(file(ITEM.id, 'Top.pdf', null), 'Media disk')).toBe('Media disk');
  });

  it('opens a file selected in its folder and a folder as itself', () => {
    expect(openHrefOf(ITEM)).toEqual({
      pathname: '/drive/root/[rootId]',
      params: { rootId: ROOT, folder: FOLDER, item: ITEM.id },
    });
    expect(openHrefOf(file(ITEM.id, 'Top.pdf', null))).toEqual({
      pathname: '/drive/root/[rootId]',
      params: { rootId: ROOT, item: ITEM.id },
    });
  });
});

describe('who or what touched it', () => {
  it('says who in the who-or-what colours', () => {
    expect(howOf(written('added', AT_NOW, 'app', { actor: ME }), NAMES)).toEqual({
      text: 'Added by you',
      colour: 'viz-blue',
    });
    expect(howOf(written('changed', AT_NOW, 'app', { actor: SAM }), NAMES)).toEqual({
      text: 'Changed by Sam',
      colour: 'viz-magenta',
    });
    expect(howOf(written('changed', AT_NOW, 'ai', { actor: ME }), NAMES).colour).toBe('viz-violet');
    expect(howOf(written('added', AT_NOW, 'automation'), NAMES).colour).toBe('viz-green');
    expect(howOf({ kind: 'opened', item: ITEM, at: AT_NOW }, NAMES).text).toBe('Opened');
  });

  it('colours share link writes by who made them, like the Activity chart', () => {
    expect(howOf(written('added', AT_NOW, 'share', { actor: ME }), NAMES)).toEqual({
      text: 'Added through a share link',
      colour: 'viz-blue',
    });
    expect(howOf(written('added', AT_NOW, 'share'), NAMES).colour).toBe('viz-magenta');
  });

  it('reads outside writes as changed outside SmartEverything in primary', () => {
    expect(howOf(written('changed', AT_NOW, 'outside'), NAMES)).toEqual({
      text: 'Changed outside SmartEverything',
      colour: 'primary',
    });
  });

  it('names the computer for mount and sync writes in the track grey', () => {
    expect(
      howOf(written('changed', AT_NOW, 'mount', { actor: ME, device: LAPTOP }), NAMES),
    ).toEqual({
      text: 'Changed in the drive on Laptop',
      colour: 'track',
    });
    expect(
      howOf(written('changed', AT_NOW, 'sync', { actor: ME, device: LAPTOP }), NAMES).text,
    ).toBe('Changed on Laptop and synced');
  });
});
