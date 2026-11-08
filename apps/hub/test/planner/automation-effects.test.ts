import { randomUUID } from 'node:crypto';
import {
  NODE_REGISTRY,
  PLANNER_ITEM_CREATE,
  PLANNER_OCCURRENCE_SINGLE,
  JSON_VALUE,
  type JsonValue,
  type PlannerItemRow,
} from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HubTool, HubToolResult, ToolCaller } from '../../src/ai-tools/hub-tool';
import type { ToolCheck } from '../../src/ai-tools/tool-hub';
import { withExecutionAuthority } from '../../src/assistant/turn-authority';
import type { ConversationAuthority } from '../../src/harness/authority-contract';
import { PLANNER_EDIT_INPUT } from '../../src/extensions/mcp/tools/planner-edits';
import { instantsOf } from '../../src/planner/instants';
import { plannerEffects } from '../../src/planner/automation-effects';
import { testStore, type TestStore } from '../support/store';
import { testRun } from '../automations-v3/effects/support';

const NOW = '2026-11-09T10:00:00.000Z';

const TOOL: HubTool = {
  name: 'planner_edit',
  title: 'Planner edit',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

interface Call {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly caller: ToolCaller;
}

interface Rig {
  readonly store: TestStore['store'];
  readonly owner: string;
  readonly ann: string;
  readonly list: string;
  readonly calls: Call[];
  readonly run: (kind: string, params: EffectRequest['params']) => Promise<NodeResult>;
}

const open: TestStore[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((test) => test.close()));
});

function request(kind: string, params: EffectRequest['params']): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'relative',
    budget: 'effects',
  };
}

function authority(profileId: string, role: 'owner' | 'member'): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    client_id: null,
    kind: 'service',
    role,
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

function inserted(
  store: TestStore['store'],
  profileId: string,
  item: z.input<typeof PLANNER_ITEM_CREATE>,
): PlannerItemRow {
  const draft = PLANNER_ITEM_CREATE.parse(item);
  return store.plannerItems.insert({
    ...draft,
    ...instantsOf(draft),
    position: 0,
    profile_id: profileId,
    series_id: null,
    original_start: null,
    status: 'open',
    google: null,
    created_by: 'person',
  });
}

function plain(row: unknown): Record<string, JsonValue> {
  return z.record(z.string(), JSON_VALUE).parse(JSON.parse(JSON.stringify(row)));
}

function completed(
  store: TestStore['store'],
  profileId: string,
  itemId: string,
  occurrenceKey: string,
): Record<string, JsonValue> {
  const row = store.plannerOccurrences.save({
    item_id: itemId,
    occurrence_key: occurrenceKey,
    status: 'done',
    completed_at: NOW,
    completed_by: 'person',
    evidence: null,
    moved_start: null,
    moved_end: null,
  });
  if (occurrenceKey === PLANNER_OCCURRENCE_SINGLE)
    store.plannerItems.update(itemId, profileId, { status: 'done' });
  return plain(row);
}

type EditInput = z.infer<typeof PLANNER_EDIT_INPUT>;

function timerStarted(
  store: TestStore['store'],
  profileId: string,
  timer: NonNullable<EditInput['timer']>,
): Record<string, JsonValue> {
  return plain(
    store.plannerTimers.insert({
      profile_id: profileId,
      label: timer.label,
      duration_ms: timer.duration_ms,
      state: 'running',
      ends_at: new Date(Date.parse(NOW) + timer.duration_ms).toISOString(),
      remaining_ms: null,
      targets: [],
    }),
  );
}

function alarmSet(
  store: TestStore['store'],
  profileId: string,
  alarm: NonNullable<EditInput['alarm']>,
): Record<string, JsonValue> {
  return plain(
    store.plannerAlarms.insert({
      profile_id: profileId,
      label: alarm.label,
      time: alarm.time,
      days: alarm.days,
      once_on: alarm.once_on,
      skip_on: null,
      enabled: true,
      sound: 'default',
      ramp_seconds: 30,
      vibrate: true,
      snooze_minutes: alarm.snooze_minutes ?? 9,
      smart_minutes: null,
      wake_scene_id: null,
      wake_lead_minutes: null,
      targets: [],
      watch: [],
      source: 'planner',
    }),
  );
}

function perform(
  store: TestStore['store'],
  profileId: string,
  args: Readonly<Record<string, unknown>>,
): Record<string, JsonValue> {
  const input = PLANNER_EDIT_INPUT.parse(args);
  if (input.action === 'add' && input.item !== undefined)
    return plain(inserted(store, profileId, input.item));
  if (input.action === 'complete' && input.itemId !== undefined)
    return completed(store, profileId, input.itemId, input.occurrenceKey ?? 'single');
  if (input.action === 'timer_start' && input.timer !== undefined)
    return timerStarted(store, profileId, input.timer);
  if (input.action === 'alarm_set' && input.alarm !== undefined)
    return alarmSet(store, profileId, input.alarm);
  throw new Error(`the fake planner_edit does not handle ${input.action}`);
}

async function rig(): Promise<Rig> {
  const test = await testStore(() => new Date(NOW));
  open.push(test);
  const { store } = test;
  const owner = store.profiles.first().id;
  const ann = store.profiles.create({ name: 'Ann' }).id;
  const list = store.plannerCollections.insert({
    profile_id: owner,
    kind: 'list',
    name: 'Chores',
    colour: 'family',
    icon: 'check',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
  }).id;
  store.plannerCollections.insert({
    profile_id: ann,
    kind: 'list',
    name: 'Ann chores',
    colour: 'family',
    icon: 'check',
    position: 0,
    visible: true,
    default_reminders: [],
    source: 'local',
    google: null,
  });
  const calls: Call[] = [];
  const handlers = plannerEffects({
    store,
    clock: { now: () => new Date(NOW) },
    integration: {
      ownerProfileId: () => owner,
      tools: {
        check: (_name, args): ToolCheck =>
          PLANNER_EDIT_INPUT.safeParse(args).success
            ? { ok: true, tool: TOOL }
            : { ok: false, reason: 'the arguments do not fit planner_edit' },
        call: (name, args, caller): Promise<HubToolResult> => {
          calls.push({ name, args, caller });
          const personId = args['personId'];
          const profileId = typeof personId === 'string' ? personId : caller.profileId;
          return Promise.resolve({
            response: perform(store, profileId, args),
            line: '',
            pictures: [],
          });
        },
      },
    },
  });
  return {
    store,
    owner,
    ann,
    list,
    calls,
    run: (kind, params): Promise<NodeResult> => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`${kind} has no handler`);
      return handler(params, request(kind, params), testRun());
    },
  };
}

let home: Rig;

beforeEach(async () => {
  home = await rig();
});

describe('registration', () => {
  it('handles exactly the registered planner effect kinds', () => {
    const effects = NODE_REGISTRY.kinds
      .filter((kind) => kind.id.startsWith('planner.') && kind.class === 'effect')
      .map((kind) => kind.id);
    expect(effects).toEqual([
      'planner.add_task',
      'planner.complete_task',
      'planner.start_timer',
      'planner.set_alarm',
    ]);
    const handlers = plannerEffects({
      store: home.store,
      clock: { now: () => new Date(NOW) },
      integration: {
        ownerProfileId: () => home.owner,
        tools: {
          check: () => ({ ok: false, reason: 'x' }),
          call: () => Promise.reject(new Error('x')),
        },
      },
    });
    expect(Object.keys(handlers)).toEqual(effects);
  });
});

describe('planner.add_task', () => {
  it('adds an open task to the first list through planner_edit and returns its id', async () => {
    const result = await home.run('planner.add_task', {
      title: 'Bins',
      notes: 'Both bins',
      due: '2026-11-10T08:00:00.000Z',
      priority: '1',
      estimate: 15 * 60_000,
    });
    expect(result).toMatchObject({ ok: true });
    expect(home.calls).toHaveLength(1);
    expect(home.calls[0]).toMatchObject({
      name: 'planner_edit',
      args: {
        action: 'add',
        item: {
          collection_id: home.list,
          kind: 'task',
          title: 'Bins',
          notes: 'Both bins',
          due_at: '2026-11-10T08:00:00.000Z',
          priority: 1,
          estimate_minutes: 15,
        },
      },
      caller: { profileId: home.owner, via: 'automation' },
    });
    const [task] = home.store.plannerItems.list(home.owner, { kind: 'task' });
    expect(result).toMatchObject({ value: { itemId: task?.id } });
    expect(task).toMatchObject({ title: 'Bins', status: 'open' });
  });

  it('prefers the default list of the person', async () => {
    const second = home.store.plannerCollections.insert({
      profile_id: home.owner,
      kind: 'list',
      name: 'Work',
      colour: 'work',
      icon: 'briefcase',
      position: 1,
      visible: true,
      default_reminders: [],
      source: 'local',
      google: null,
    }).id;
    const preferences = home.store.plannerPreferences;
    const base = {
      general: {
        week_start: 1,
        day_start: '06:00',
        day_end: '23:00',
        working_hours: { days: [1], start: '09:00', end: '17:00' },
        shown_profile_id: null,
      },
      day_planner: {
        fade: 'soft',
        show_happened: true,
        show_sleep: true,
        show_weather: true,
        missed_scope: 'since_last_open',
      },
      tasks: { default_collection_id: second, smart_lists: [], suggest_completion: true },
      calendar: {
        default_view: 'week',
        default_reminders: [],
        show_tasks: true,
        show_alarms: true,
        show_sleep: true,
        show_free_time: false,
      },
      clock: {
        sound: 'default',
        ramp_seconds: 30,
        snooze_minutes: 9,
        targets: [],
        wake_scene_id: null,
        world_clocks: [],
      },
      watch: { watch_alarm_sync: true, watch_calendar_push: true },
      ai: { briefing: 'off', evening_review: false, plan_suggestions: true },
    } as const;
    preferences.put(home.owner, base);
    await home.run('planner.add_task', { title: 'Report' });
    expect(home.calls[0]?.args).toMatchObject({ item: { collection_id: second } });
  });

  it('fails as invalid when the person has no list', async () => {
    const result = await withExecutionAuthority(authority(home.owner, 'owner'), () =>
      home.run('planner.add_task', {
        title: 'Bins',
        person: { person: home.store.profiles.create({ name: 'Bob' }).id },
      }),
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(home.calls).toHaveLength(0);
  });

  it('refuses a title that is empty', async () => {
    expect(await home.run('planner.add_task', { title: '  ' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(home.calls).toHaveLength(0);
  });

  it('lets the owner add for another person and passes the person on', async () => {
    const result = await withExecutionAuthority(authority(home.owner, 'owner'), () =>
      home.run('planner.add_task', { title: 'Homework', person: { person: home.ann } }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(home.calls[0]?.args).toMatchObject({ personId: home.ann });
    expect(home.store.plannerItems.list(home.ann, { kind: 'task' })).toHaveLength(1);
    expect(home.store.plannerItems.list(home.owner, { kind: 'task' })).toHaveLength(0);
  });

  it('refuses a member who names another person', async () => {
    const result = await withExecutionAuthority(authority(home.ann, 'member'), () =>
      home.run('planner.add_task', { title: 'Sneaky', person: { person: home.owner } }),
    );
    expect(result).toMatchObject({ ok: false, class: 'Forbidden' });
    expect(home.calls).toHaveLength(0);
  });

  it('adds for the member herself under her own authority', async () => {
    const result = await withExecutionAuthority(authority(home.ann, 'member'), () =>
      home.run('planner.add_task', { title: 'Mine' }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(home.calls[0]?.caller).toMatchObject({ profileId: home.ann, role: 'member' });
    expect(home.store.plannerItems.list(home.ann, { kind: 'task' })).toHaveLength(1);
  });
});

describe('planner.complete_task', () => {
  it('completes a single task and is idempotent', async () => {
    const item = inserted(home.store, home.owner, {
      collection_id: home.list,
      kind: 'task',
      title: 'Bins',
    });
    expect(await home.run('planner.complete_task', { itemId: item.id })).toMatchObject({
      ok: true,
      value: { ok: true },
    });
    expect(home.calls[0]?.args).toMatchObject({
      action: 'complete',
      itemId: item.id,
      occurrenceKey: PLANNER_OCCURRENCE_SINGLE,
    });
    expect(home.store.plannerItems.byId(item.id, home.owner).status).toBe('done');
    expect(await home.run('planner.complete_task', { itemId: item.id })).toMatchObject({
      ok: true,
      value: { ok: true },
    });
  });

  it('completes the repeating occurrence that is due now', async () => {
    const item = inserted(home.store, home.owner, {
      collection_id: home.list,
      kind: 'task',
      title: 'Brush',
      start_local: '2026-11-07T07:30',
      time_zone: 'UTC',
      rrule: 'FREQ=DAILY',
    });
    expect(await home.run('planner.complete_task', { itemId: item.id })).toMatchObject({
      ok: true,
      value: { ok: true },
    });
    expect(home.calls[0]?.args).toMatchObject({ occurrenceKey: '2026-11-09T07:30:00.000Z' });
  });

  it('reports not done when a repeating task has no occurrence due yet', async () => {
    const item = inserted(home.store, home.owner, {
      collection_id: home.list,
      kind: 'task',
      title: 'Later',
      start_local: '2026-12-01T07:30',
      time_zone: 'UTC',
      rrule: 'FREQ=DAILY',
    });
    expect(await home.run('planner.complete_task', { itemId: item.id })).toMatchObject({
      ok: true,
      value: { ok: false },
    });
    expect(home.calls).toHaveLength(0);
  });

  it('fails as not found for a task that does not exist', async () => {
    expect(await home.run('planner.complete_task', { itemId: randomUUID() })).toMatchObject({
      ok: false,
      class: 'NotFound',
    });
  });

  it('does not reach into another person planner as a member', async () => {
    const item = inserted(home.store, home.owner, {
      collection_id: home.list,
      kind: 'task',
      title: 'Private',
    });
    const result = await withExecutionAuthority(authority(home.ann, 'member'), () =>
      home.run('planner.complete_task', { itemId: item.id }),
    );
    expect(result).toMatchObject({ ok: false, class: 'NotFound' });
    expect(home.store.plannerItems.byId(item.id, home.owner).status).toBe('open');
  });
});

describe('planner.start_timer', () => {
  it('starts a timer and returns its id and end', async () => {
    const result = await home.run('planner.start_timer', { duration: 600_000, label: 'Pasta' });
    expect(home.calls[0]).toMatchObject({
      args: { action: 'timer_start', timer: { duration_ms: 600_000, label: 'Pasta' } },
    });
    const [timer] = home.store.plannerTimers.list(home.owner);
    expect(result).toMatchObject({
      ok: true,
      value: { timerId: timer?.id, endsAt: '2026-11-09T10:10:00.000Z' },
    });
  });

  it('starts a second timer on a second run', async () => {
    await home.run('planner.start_timer', { duration: 60_000 });
    await home.run('planner.start_timer', { duration: 60_000 });
    expect(home.store.plannerTimers.list(home.owner)).toHaveLength(2);
  });

  it('refuses a duration that is not positive', async () => {
    expect(await home.run('planner.start_timer', { duration: 0 })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
  });
});

describe('planner.set_alarm', () => {
  it('rings once at the next time that comes round when no weekdays are chosen', async () => {
    const result = await home.run('planner.set_alarm', { at: '06:30', label: 'Wake' });
    expect(home.calls[0]?.args).toMatchObject({
      action: 'alarm_set',
      alarm: { time: '06:30', days: [], once_on: '2026-11-10', label: 'Wake' },
    });
    expect(result).toMatchObject({ ok: true, value: { nextAt: '2026-11-10T06:30:00.000Z' } });
  });

  it('rings today when the time is still ahead', async () => {
    const result = await home.run('planner.set_alarm', { at: '18:00' });
    expect(result).toMatchObject({ ok: true, value: { nextAt: '2026-11-09T18:00:00.000Z' } });
  });

  it('repeats on the chosen weekdays with the snooze', async () => {
    const result = await home.run('planner.set_alarm', {
      at: '07:00',
      days: [1, 2, 3],
      snooze: 5,
    });
    expect(home.calls[0]?.args).toMatchObject({
      alarm: { time: '07:00', days: [1, 2, 3], snooze_minutes: 5 },
    });
    expect(home.calls[0]?.args['alarm']).not.toHaveProperty('once_on');
    expect(result).toMatchObject({ ok: true, value: { nextAt: '2026-11-10T07:00:00.000Z' } });
  });

  it('refuses a malformed time of day', async () => {
    expect(await home.run('planner.set_alarm', { at: '7am' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(home.calls).toHaveLength(0);
  });
});
