import { describe, expect, it } from 'vitest';
import {
  ALL_NODE_KINDS,
  AUTOMATION_RUN_ID,
  EMPTY_LAYOUT,
  type AutomationProgramRevisionSummary,
  type AutomationRunSummary,
  type NodeKind,
} from '@smarteverything/domain';
import { airPurifier } from '../model/fixtures/air-purifier';
import {
  ACTIVITY_DAYS,
  RECENT_RUNS,
  activityOf,
  authorLabel,
  dynamicUsage,
  manifestFor,
  statusLine,
  usageGroups,
  versionRows,
} from './detail-model';

const KINDS = new Map(ALL_NODE_KINDS.map((kind) => [kind.id, kind]));
const kindOf = (id: string): NodeKind | undefined => KINDS.get(id);
const NO_FUNCTIONS = (): undefined => undefined;
const PURIFIER = airPurifier();

function revision(
  number: number,
  author: AutomationProgramRevisionSummary['author'],
): AutomationProgramRevisionSummary {
  return {
    revision: number,
    saved_at: `2026-10-1${String(number)}T10:00:00.000Z`,
    author,
    plan_hash: '0'.repeat(64),
  };
}

describe('statusLine', () => {
  it('names the state, the revision and an unpublished draft', () => {
    expect(statusLine({ enabled: true, revision: 7, draft: null })).toBe('Live · revision 7');
    expect(
      statusLine({
        enabled: false,
        revision: 3,
        draft: { program: PURIFIER, layout: EMPTY_LAYOUT },
      }),
    ).toBe('Paused · revision 3 · draft has changes');
  });
});

describe('versionRows', () => {
  const person = (id: string): string | null => (id === 'p1' ? 'Mai' : null);

  it('lists the newest first, marks the live one and names who saved it', () => {
    const rows = versionRows(
      [
        revision(1, { via: 'person', profile_id: 'p1' }),
        revision(3, { via: 'assistant', profile_id: 'p1' }),
        revision(2, null),
      ],
      3,
      person,
    );
    expect(rows.map((row) => [row.revision, row.live, row.by])).toEqual([
      [3, true, 'The assistant'],
      [2, false, 'Unknown author'],
      [1, false, 'Mai'],
    ]);
  });

  it('does not invent a name for a person it does not know', () => {
    expect(authorLabel({ via: 'person', profile_id: 'p9' }, person)).toBe('A household member');
  });
});

describe('manifest uses', () => {
  it('lists the devices the program touches with their names', () => {
    const manifest = manifestFor(PURIFIER, kindOf, NO_FUNCTIONS);
    expect(manifest).not.toBeNull();
    if (manifest === null) return;
    const groups = usageGroups(manifest, (_, id) => `name of ${id.slice(0, 4)}`);
    const devices = groups.find((group) => group.slot === 'device');
    expect(devices?.title).toBe('Devices');
    expect(devices?.chips.length).toBeGreaterThanOrEqual(2);
    expect(devices?.chips.every((chip) => chip.label.startsWith('name of'))).toBe(true);
    expect(dynamicUsage(manifest)).toEqual([]);
  });

  it('says a removed thing was removed when its name is unknown', () => {
    const manifest = manifestFor(PURIFIER, kindOf, NO_FUNCTIONS);
    if (manifest === null) throw new Error('the fixture program must lower');
    const groups = usageGroups(manifest, () => undefined);
    expect(
      groups.flatMap((group) => group.chips).every((chip) => chip.label.startsWith('A removed')),
    ).toBe(true);
  });
});

describe('activityOf', () => {
  const NOW = Date.parse('2026-10-18T10:00:00.000Z');

  function run(
    id: number,
    status: AutomationRunSummary['status'],
    daysAgo: number,
  ): AutomationRunSummary {
    const at = new Date(NOW - daysAgo * 86_400_000).toISOString();
    return {
      id: AUTOMATION_RUN_ID.parse(`90000000-0000-4000-8000-${String(id).padStart(12, '0')}`),
      automation_id: 'a',
      revision: 1,
      owner_profile_id: null,
      control_key: null,
      parent_run_id: null,
      status,
      mode: 'live',
      plan_hash: 'hash',
      current_node: null,
      started_by: null,
      steps: 3,
      commands: 0,
      iterations: 0,
      active_paths: [],
      wake_at: null,
      error: null,
      created_at: at,
      started_at: at,
      finished_at: at,
    };
  }

  it('charts thirty days and keeps the last five runs, newest first', () => {
    const runs = Array.from({ length: 8 }, (_, index) =>
      run(index + 1, index === 2 ? 'failed' : 'succeeded', index),
    );
    const activity = activityOf(runs, NOW, 'UTC');
    expect(activity.summary.days).toHaveLength(ACTIVITY_DAYS);
    expect(activity.summary.totals.total).toBe(8);
    expect(activity.summary.totals.failed).toBe(1);
    expect(activity.recent).toHaveLength(RECENT_RUNS);
    expect(activity.recent[0]?.created_at).toBe(runs[0]?.created_at);
  });
});
