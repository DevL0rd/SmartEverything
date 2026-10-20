import { describe, expect, it } from 'vitest';
import { copyName } from './copy-name';
import { entriesOf, entryOf, type ListEntry } from './list-entries';
import {
  KITCHEN_ROOM,
  NOW,
  TODAY,
  called,
  contextFor,
  evented,
  idOf,
  roomy,
  rowOf,
  runOf,
  timed,
} from './list-fixtures';
import {
  DEFAULT_VIEW,
  countOf,
  filterChoices,
  headerLine,
  matchesFilter,
  sectionsOf,
} from './list-view';
import { NO_STATS, healthOf, peakOf, stackOf, statsByAutomation, statsLine } from './run-stats';

const ZONE = 'UTC';
const stats = (
  runs: Parameters<typeof statsByAutomation>[0],
): ReturnType<typeof statsByAutomation> => statsByAutomation(runs, TODAY, ZONE);

describe('run stats', () => {
  const runs = [
    runOf(1, 1, 'succeeded', '2026-10-18T09:00:00.000Z'),
    runOf(2, 1, 'failed', '2026-10-18T10:00:00.000Z'),
    runOf(3, 1, 'ignored', '2026-10-17T10:00:00.000Z'),
    runOf(4, 1, 'succeeded', '2026-10-01T10:00:00.000Z'),
    runOf(5, 1, 'waiting', '2026-10-18T11:00:00.000Z'),
    { ...runOf(6, 1, 'succeeded', '2026-10-18T09:30:00.000Z'), mode: 'dry' as const },
    runOf(7, 2, 'succeeded', '2026-10-16T09:30:00.000Z'),
  ];

  it('buckets seven days of live runs by outcome and counts active ones', () => {
    const one = stats(runs).get(idOf(1));
    expect(one?.days).toHaveLength(7);
    expect(one?.days.at(-1)).toMatchObject({ day: TODAY, succeeded: 1, failed: 1 });
    expect(one?.days.at(-2)).toMatchObject({ ignored: 1 });
    expect(one).toMatchObject({ total: 2, failed: 1, active: 1, waiting: 1 });
    expect(stats(runs).get(idOf(2))?.total).toBe(1);
  });

  it('describes the week and sizes the stack against the busiest day', () => {
    const one = stats(runs).get(idOf(1)) ?? NO_STATS;
    expect(statsLine(one, 214)).toBe('7 days · 2 runs · 1 failed · 214 in all');
    expect(peakOf(one.days)).toBe(2);
    expect(
      stackOf(one.days.at(-1) ?? { day: '', succeeded: 0, failed: 0, ignored: 0 }, 2, 24),
    ).toEqual([
      { outcome: 'succeeded', height: 12 },
      { outcome: 'failed', height: 12 },
    ]);
    expect(stackOf(one.days[0] ?? { day: '', succeeded: 0, failed: 0, ignored: 0 }, 0, 24)).toEqual(
      [],
    );
  });

  it('counts today and the waiting runs for the health strip', () => {
    const health = healthOf(runs, NOW, ZONE);
    expect(health).toMatchObject({ runsToday: 2, failedToday: 1, waiting: 1 });
    expect(health.perHour).toHaveLength(24);
    expect(health.perHour.reduce((sum, point) => sum + point.v, 0)).toBe(2);
  });
});

describe('entries and sections', () => {
  const context = contextFor({ updates: new Set([idOf(7)]) });
  const rows = [
    rowOf(1, timed(), { name: 'Evening' }),
    rowOf(2, evented(), { name: 'Button', author: { via: 'assistant', profile_id: idOf(99) } }),
    rowOf(3, called(), { name: 'Helper' }),
    rowOf(4, evented(), { name: 'Off', enabled: false }),
    rowOf(5, evented(), { name: 'Broken', last_error: 'No device' }),
    rowOf(6, evented(), { name: 'Busy' }),
    rowOf(7, roomy(), { name: 'Kitchen', draft: null }),
  ];
  const busy = stats([runOf(1, 6, 'running', '2026-10-18T11:30:00.000Z')]);
  const entries = entriesOf(rows, busy, context);

  it('puts each automation in its section', () => {
    const section = (name: string): string | undefined =>
      entries.find((entry) => entry.name === name)?.section;
    expect(section('Evening')).toBe('scheduled');
    expect(section('Button')).toBe('events');
    expect(section('Helper')).toBe('called');
    expect(section('Off')).toBe('paused');
    expect(section('Broken')).toBe('attention');
    expect(section('Busy')).toBe('running');
  });

  it('adds chips and the rooms an automation touches', () => {
    const find = (name: string): ListEntry | undefined =>
      entries.find((entry) => entry.name === name);
    expect(find('Button')?.chips).toEqual(['assistant']);
    expect(find('Kitchen')?.chips).toEqual(['update']);
    expect(find('Kitchen')?.rooms).toEqual([KITCHEN_ROOM]);
    expect(
      entryOf(
        rowOf(8, evented(), {
          draft: {
            program: evented(),
            layout: rows[0]?.layout ?? { nodes: {}, frames: [], comments: [] },
          },
        }),
        NO_STATS,
        context,
      ).chips,
    ).toEqual(['draft']);
  });

  it('orders sections, filters, sorts and searches', () => {
    const all = sectionsOf(entries, DEFAULT_VIEW);
    expect(all.map((section) => section.id)).toEqual([
      'attention',
      'running',
      'scheduled',
      'events',
      'called',
      'paused',
    ]);
    expect(countOf(all)).toBe(7);
    expect(countOf(sectionsOf(entries, { ...DEFAULT_VIEW, filter: 'on' }))).toBe(6);
    expect(countOf(sectionsOf(entries, { ...DEFAULT_VIEW, filter: 'failing' }))).toBe(1);
    expect(countOf(sectionsOf(entries, { ...DEFAULT_VIEW, filter: 'running' }))).toBe(1);
    expect(countOf(sectionsOf(entries, { ...DEFAULT_VIEW, filter: `room:${KITCHEN_ROOM}` }))).toBe(
      1,
    );
    expect(countOf(sectionsOf(entries, { ...DEFAULT_VIEW, query: 'EVEN' }))).toBe(1);
    const events = sectionsOf(entries, { ...DEFAULT_VIEW, sort: 'name' }).find(
      (s) => s.id === 'events',
    );
    expect(events?.entries.map((entry) => entry.name)).toEqual(['Button', 'Kitchen']);
  });

  it('sorts by most runs and last run', () => {
    const counted = entriesOf(
      [
        rowOf(1, evented(), { run_count: 5, last_run_at: '2026-10-18T08:00:00.000Z' }),
        rowOf(2, evented(), { run_count: 9, last_run_at: '2026-10-17T08:00:00.000Z' }),
      ],
      new Map(),
      context,
    );
    const first = (sort: 'most-runs' | 'last-run'): string | undefined =>
      sectionsOf(counted, { ...DEFAULT_VIEW, sort })[0]?.entries[0]?.name;
    expect(first('most-runs')).toBe('Rule 2');
    expect(first('last-run')).toBe('Rule 1');
  });

  it('offers filter chips with counts and a header line', () => {
    const choices = filterChoices(entries, context.rooms);
    expect(choices.find((choice) => choice.id === 'all')?.count).toBe(7);
    expect(choices.find((choice) => choice.label === 'Kitchen')?.count).toBe(1);
    expect(choices.some((choice) => choice.id === 'assistant')).toBe(true);
    expect(entries.filter((entry) => matchesFilter(entry, 'assistant'))).toHaveLength(1);
    expect(headerLine(entries)).toBe('6 on · 1 paused · 1 needs attention');
  });
});

describe('copy names', () => {
  it('numbers copies that already exist', () => {
    expect(copyName('Lights', [])).toBe('Lights copy');
    expect(copyName('Lights', ['lights copy'])).toBe('Lights copy 2');
    expect(copyName('Lights', ['Lights copy', 'Lights copy 2'])).toBe('Lights copy 3');
  });
});
