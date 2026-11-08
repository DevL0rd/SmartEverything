import { describe, expect, it } from 'vitest';
import { DRIVE_FEED_ROW, DRIVE_VIA, type DriveFeedRow } from '@smarteverything/domain';
import {
  activityColumns,
  badgeOf,
  bucketKeysOf,
  busiestOf,
  chartSummary,
  folderCounts,
  inRange,
  isChange,
  outsideOf,
  peopleLabel,
  sentenceOf,
  seriesOf,
  seriesTotals,
  SERIES_LOOK,
  targetOf,
  VIA_LOOK,
  type ActivityEntry,
} from './via-model';

const ME = 'a1b2c3d4-0000-4000-8000-0000000000a1';
const SAM = 'a1b2c3d4-0000-4000-8000-0000000000a2';
const ROOT = 'a1b2c3d4-0000-4000-8000-0000000000b1';
const FOLDER = 'a1b2c3d4-0000-4000-8000-0000000000c1';
const OTHER_FOLDER = 'a1b2c3d4-0000-4000-8000-0000000000c2';
const ITEM = 'a1b2c3d4-0000-4000-8000-0000000000d1';
const DEVICE = 'a1b2c3d4-0000-4000-8000-0000000000e1';
const NOW = Date.parse('2026-11-07T12:00:00.000Z');
const VIEWER = { me: ME, zone: 'UTC', now: NOW };

let seq = 0;

function row(fields: Partial<DriveFeedRow>): DriveFeedRow {
  seq += 1;
  return DRIVE_FEED_ROW.parse({
    seq,
    rootId: ROOT,
    itemId: ITEM,
    op: 'update',
    rev: 1,
    at: '2026-11-07T09:10:00.000Z',
    actorProfileId: ME,
    via: 'app',
    deviceId: null,
    ...fields,
  });
}

function entry(fields: Partial<DriveFeedRow>, extra: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    row: row(fields),
    itemName: 'Notes.md',
    folderId: FOLDER,
    folderPath: 'Projects › Home',
    actorName: fields.actorProfileId === SAM ? 'Sam' : 'Erin',
    deviceName: null,
    ...extra,
  };
}

const NOBODY = { actorProfileId: null } as const;

describe('via model', () => {
  it('names every via with a chip, a badge and an icon', () => {
    expect(DRIVE_VIA.map((via) => VIA_LOOK[via].chip)).toEqual([
      'App',
      'AI',
      'Automations',
      'Mount',
      'Sync',
      'Scan',
      'Share',
      'Outside',
    ]);
  });

  it('puts each change in one of the six who-or-what series', () => {
    expect(seriesOf(row({}), ME)).toBe('you');
    expect(seriesOf(row({ actorProfileId: SAM }), ME)).toBe('people');
    expect(seriesOf(row({ via: 'share', ...NOBODY }), ME)).toBe('people');
    expect(seriesOf(row({ via: 'ai' }), ME)).toBe('ai');
    expect(seriesOf(row({ via: 'automation' }), ME)).toBe('automation');
    expect(seriesOf(row({ via: 'sync', deviceId: DEVICE }), ME)).toBe('background');
    expect(seriesOf(row({ via: 'mount', deviceId: DEVICE }), ME)).toBe('background');
    expect(seriesOf(row({ via: 'scan', ...NOBODY }), ME)).toBe('background');
    expect(seriesOf(row({ via: 'outside', ...NOBODY }), ME)).toBe('outside');
    expect(seriesOf(row({}), null)).toBe('people');
  });

  it('keeps the fixed colour meaning: people tones, violet AI, green automation, grey sync, amber outside', () => {
    expect(Object.values(SERIES_LOOK).map((look) => look.colour)).toEqual([
      'viz-blue',
      'viz-magenta',
      'viz-violet',
      'viz-green',
      'track',
      'primary',
    ]);
  });

  it('writes the sentence the feed row shows', () => {
    expect(sentenceOf(entry({ actorProfileId: SAM, op: 'create' }), ME)).toBe('Sam added Notes.md');
    expect(sentenceOf(entry({ op: 'trash' }), ME)).toBe('You moved Notes.md to trash');
    expect(sentenceOf(entry({ via: 'ai', op: 'rename' }), ME)).toBe('AI renamed Notes.md');
    expect(sentenceOf(entry({ via: 'outside', ...NOBODY }), ME)).toBe(
      'Notes.md changed on the disk',
    );
    expect(
      sentenceOf(entry({ via: 'share', op: 'create', ...NOBODY }, { actorName: null }), ME),
    ).toBe('Someone with a link added Notes.md');
  });

  it('names the computer on sync and mount badges only', () => {
    const synced = entry({ via: 'sync', deviceId: DEVICE }, { deviceName: 'Laptop' });
    expect(badgeOf(synced)).toBe('Sync · Laptop');
    expect(badgeOf(entry({ via: 'automation' }, { deviceName: 'Laptop' }))).toBe('Automation');
  });

  it('opens the item in its folder with the details pane on Activity', () => {
    expect(targetOf(entry({}))).toEqual({
      rootId: ROOT,
      params: { folder: FOLDER, item: ITEM, tab: 'activity' },
    });
    expect(targetOf(entry({}, { folderId: null })).params).toEqual({
      item: ITEM,
      tab: 'activity',
    });
  });

  it('counts stars as activity but not as changes', () => {
    expect(isChange(row({ op: 'star' }))).toBe(false);
    expect(isChange(row({ op: 'delete' }))).toBe(true);
  });
});

describe('ranges and columns', () => {
  it('spans 7 days, 30 days or 12 months ending today', () => {
    const week = bucketKeysOf('week', NOW, 'UTC');
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toBe('2026-11-07');
    expect(week[0]).toBe('2026-11-01');
    expect(bucketKeysOf('month', NOW, 'UTC')).toHaveLength(30);
    const year = bucketKeysOf('year', NOW, 'UTC');
    expect(year[0]).toBe('2025-12');
    expect(year.at(-1)).toBe('2026-11');
  });

  it('stacks the changes of each day by series and leaves stars out', () => {
    const entries = [
      entry({}),
      entry({ actorProfileId: SAM }),
      entry({ via: 'outside', ...NOBODY }),
      entry({ op: 'star' }),
      entry({ at: '2026-11-05T08:00:00.000Z', via: 'ai' }),
      entry({ at: '2026-10-01T08:00:00.000Z' }),
    ];
    const columns = activityColumns(entries, 'week', VIEWER);
    const today = columns.at(-1);
    expect(today?.counts).toEqual({
      you: 1,
      people: 1,
      ai: 0,
      automation: 0,
      background: 0,
      outside: 1,
    });
    expect(today?.total).toBe(3);
    expect(columns[4]?.counts.ai).toBe(1);
    expect(seriesTotals(columns)).toMatchObject({ you: 1, ai: 1 });
    expect(activityColumns(entries, 'year', VIEWER).at(-2)?.total).toBe(1);
  });

  it('names the busiest day, the first one on a tie, and none when nothing changed', () => {
    const entries = [
      entry({ at: '2026-11-05T08:00:00.000Z' }),
      entry({ at: '2026-11-05T09:00:00.000Z' }),
      entry({ at: '2026-11-06T08:00:00.000Z' }),
      entry({ at: '2026-11-06T09:00:00.000Z' }),
      entry({}),
    ];
    const columns = activityColumns(entries, 'week', VIEWER);
    const busiest = busiestOf(columns);
    expect(busiest?.key).toBe('2026-11-05');
    expect(busiest?.total).toBe(2);
    expect(busiest?.spoken).toBe(`${busiest?.when ?? ''}, 2 changes`);
    expect(busiestOf(activityColumns([], 'week', VIEWER))).toBeNull();
  });

  it('keeps only the entries inside the range', () => {
    const old = entry({ at: '2026-10-20T08:00:00.000Z' });
    expect(inRange([entry({}), old], 'week', VIEWER)).toHaveLength(1);
    expect(inRange([entry({}), old], 'month', VIEWER)).toHaveLength(2);
  });

  it('reads the chart out with the range wording', () => {
    const columns = activityColumns([entry({}), entry({ via: 'ai' })], 'month', VIEWER);
    const labels = {
      you: 'You',
      people: 'Sam',
      ai: 'AI',
      automation: 'Automations',
      background: 'Sync',
      outside: 'Outside',
    };
    expect(chartSummary(columns, 'month', labels)).toBe(
      'Changes per day in the last 30 days, 2 changes: You 1, AI 1',
    );
    expect(chartSummary(activityColumns([], 'year', VIEWER), 'year', labels)).toBe(
      'Changes per month in the last year, 0 changes',
    );
  });

  it('names the one other person, or says other people', () => {
    expect(peopleLabel([entry({ actorProfileId: SAM })], ME)).toBe('Sam');
    expect(peopleLabel([entry({ actorProfileId: SAM }), entry({}, {})], null)).toBe('Other people');
    expect(peopleLabel([], ME)).toBe('Other people');
  });
});

describe('folders', () => {
  it('ranks folders by changes, then by name', () => {
    const entries = [
      entry({}, { folderId: OTHER_FOLDER, folderPath: 'Media › Films' }),
      entry({}),
      entry({}),
      entry({ op: 'star' }, { folderId: OTHER_FOLDER, folderPath: 'Media › Films' }),
      entry({}, { folderId: null, folderPath: 'Media' }),
    ];
    expect(folderCounts(entries).map((folder) => [folder.label, folder.count])).toEqual([
      ['Projects › Home', 2],
      ['Media', 1],
      ['Media › Films', 1],
    ]);
  });

  it('calls out only the changes made outside SmartEverything', () => {
    const summary = outsideOf([
      entry({ via: 'outside', ...NOBODY }),
      entry({ via: 'outside', ...NOBODY }, { folderId: OTHER_FOLDER, folderPath: 'Taxes' }),
      entry({ via: 'outside', ...NOBODY }),
      entry({}),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.folders.map((folder) => folder.count)).toEqual([2, 1]);
  });
});
