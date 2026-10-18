import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AUTOMATION_ROW, type AutomationRow } from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import { ruleOf, scheduledOf } from '../data/use-automations';
import { dayWindow, upcomingRuns } from './schedule';
import { storedFocusTargets } from './search-targets';
import type { Names } from './describe';
import { readDraft } from './editor-state';

const STORED = z.array(
  z.object({ name: AUTOMATION_ROW.shape.name, definition: AUTOMATION_ROW.shape.definition }),
);
type Stored = z.infer<typeof STORED>[number];
const LIVE = STORED.parse(
  JSON.parse(readFileSync(new URL('./live-automations.fixture.json', import.meta.url), 'utf8')),
);

const PURIFIER = '00000000-0000-4000-8000-000000000001';
const KITCHEN_SWITCH = '00000000-0000-4000-8000-000000000129';
const NAMES: Names = {
  devices: [
    { ...deviceFixture(1, { id: PURIFIER }), label: 'Air purifier' },
    { ...deviceFixture(2, { id: KITCHEN_SWITCH }), label: 'Kitchen switch' },
  ],
  scenes: [],
  people: [],
  chats: [],
};

function rowOf(
  entry: Stored,
  change: Partial<Pick<AutomationRow, 'enabled' | 'last_error'>> = {},
): AutomationRow {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    name: entry.name,
    enabled: true,
    revision: 1,
    definition: entry.definition,
    origin: null,
    author: null,
    last_run_at: '2026-10-17T00:00:00.000Z',
    last_error: null,
    run_count: 3,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...change,
  };
}

function ruleNamed(name: string, change?: Parameters<typeof rowOf>[1]): ReturnType<typeof ruleOf> {
  const entry = LIVE.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`No live automation ${name}`);
  return ruleOf(rowOf(entry, change), NAMES);
}

describe('live automations served by the hub', () => {
  it('reads every stored definition and none needs attention', () => {
    const rules = LIVE.map((entry) => ruleOf(rowOf(entry), NAMES));
    expect(rules).toHaveLength(25);
    expect(rules.filter((rule) => rule.automation === null).map((rule) => rule.row.name)).toEqual(
      [],
    );
    expect(rules.filter((rule) => rule.section === 'attention')).toEqual([]);
    expect(rules.filter((rule) => rule.sentence === null).map((rule) => rule.row.name)).toEqual([]);
  });

  it('files timed and event automations under their sections with a full sentence', () => {
    expect(ruleNamed('Scent diffusers on at 7 am')).toMatchObject({ section: 'scheduled' });
    expect(ruleNamed('Scent diffusers on at 7 am').sentence).toMatch(/^Every day at 07:00, /);
    expect(ruleNamed('Air Purifier Boost')).toMatchObject({ section: 'events' });
    expect(ruleNamed('Air Purifier Boost').sentence).toMatch(/^When Air purifier .*20/);
    expect(ruleNamed('Kitchen switch - long press off')).toMatchObject({ section: 'events' });
    expect(ruleNamed('Kitchen switch - long press off').sentence).toMatch(
      /^When Button pressed for Kitchen switch matching Press type: long_press, /,
    );
    expect(ruleNamed('Living room presence - empty light off').section).toBe('events');
  });

  it('shows a run error only while the hub reports one', () => {
    const failed = ruleNamed('Scent diffusers on at 7 am', { last_error: 'device offline' });
    expect(failed.section).toBe('attention');
    expect(ruleNamed('Scent diffusers on at 7 am', { last_error: null }).section).toBe('scheduled');
    expect(ruleNamed('Kitchen switch - press cycles brightness', { enabled: false }).section).toBe(
      'paused',
    );
  });

  it('lists focus targets for every stored definition without throwing', () => {
    const found = LIVE.map((entry) => storedFocusTargets(rowOf(entry), NAMES));
    expect(found.filter((targets) => targets === null)).toEqual([]);
    expect(found.every((targets) => (targets?.targets.length ?? 0) > 0)).toBe(true);
  });

  it('opens every stored definition in the editor exactly as the hub keeps it', () => {
    for (const entry of LIVE) {
      const read = readDraft({ name: entry.name, enabled: true, definition: entry.definition });
      expect(read.readable).toBe(true);
      if (read.readable) expect(read.draft.automation).toEqual(entry.definition);
    }
  });

  it('flags a definition the hub schema rejects', () => {
    const entry = { name: 'Broken', definition: { when: [], steps: [] } };
    expect(ruleOf(rowOf(entry), NAMES).section).toBe('attention');
  });

  it('puts the timed automations on the schedule at their stored time', () => {
    const rule = ruleNamed('Scent diffusers on at 7 am');
    const place = { timeZone: 'UTC', location: null };
    const window = dayWindow(new Date('2026-10-17T00:00:00.000Z'), 'UTC', 0);
    const runs = upcomingRuns(
      [{ id: rule.row.id, name: rule.row.name, scheduled: scheduledOf(rule) }],
      window,
      place,
    );
    expect(runs.map((run) => run.at.toISOString())).toEqual(['2026-10-17T07:00:00.000Z']);
  });
});
