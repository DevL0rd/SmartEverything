import { pluginNodeKindId, type WatchActionRequest } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolCaller } from '../../src/ai-tools/hub-tool';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { createKindCatalog } from '../../src/automations/plugin-kinds/catalog';
import { PLUGIN_NODE_PREFIX, pluginNodeEffects } from '../../src/automations/plugin-kinds/perform';
import type { WatchOutcome } from '../../src/local/watch-actions';
import { registerWatchAutomation } from '../../src/local/watch-automation';
import { watchAutomationRuntime } from '../../src/local/watch-automation-tools';
import { testRun } from '../automations-v3/effects/support';
import { testStore, type TestStore } from '../support/store';

const OWNER = { kind: 'driver', id: 'watch' } as const;

const ALARM_CONFIG = {
  settings: [],
  alarms: [{ id: 3, time: '06:45', enabled: true, days: ['mon'], smart: true }],
  faces: [
    { id: 'face-1', name: 'Neon clock', active: true, removable: true },
    { id: 'face-2', name: 'Classic', active: false, removable: true },
  ],
  goals: [],
  sports: [],
};

const CALLER: ToolCaller = {
  profileId: 'profile-1',
  role: 'owner',
  chatId: null,
  via: 'app',
  clientId: null,
};

let opened: TestStore;
let watchId: string;
let asked: {
  readonly deviceId: string;
  readonly action: WatchActionRequest;
  readonly by: string;
}[];
let outcome: WatchOutcome;

beforeEach(async () => {
  opened = await testStore();
  asked = [];
  outcome = { ok: true, detail: 'Done' };
  const [watch] = opened.store.devices.upsert([
    {
      provider: 'local',
      externalId: 'xiaomi_watch:aa:bb',
      parentId: null,
      kind: 'other',
      name: 'Band',
      model: 'miwear.watch',
      manufacturer: 'xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: { driver: 'xiaomi_watch', config: ALARM_CONFIG },
    },
  ]);
  if (watch === undefined) throw new Error('the watch was not stored');
  watchId = watch.id;
});

afterEach(async () => {
  await opened.close();
});

function perform(
  kind: string,
  params: Record<string, string | boolean | readonly string[]>,
  mode?: 'wait_for_result',
): Promise<unknown> {
  const catalog = createKindCatalog();
  registerWatchAutomation(
    catalog,
    watchAutomationRuntime({
      store: opened.store,
      watches: {
        target: (device) => ({
          deviceId: device.id,
          profileId: 'profile-1',
          name: device.name,
          bridgeClientId: null,
        }),
      },
      actions: {
        attempt: (target, action, by) => {
          asked.push({ deviceId: target.deviceId, action, by });
          return Promise.resolve(outcome);
        },
      },
    }),
  );
  const handlers = pluginNodeEffects({
    store: opened.store,
    events: { record: (): void => undefined },
    clock: { now: (): Date => new Date('2026-10-25T10:00:00.000Z') },
    signals: { subscribe: (): (() => void) => () => undefined },
    tools: () => catalog.driverNodes.over(() => new ToolHub([])),
    drivers: catalog.driverNodes,
  });
  const handler = handlers[PLUGIN_NODE_PREFIX];
  if (handler === undefined) throw new Error('no plugin performer');
  const request: EffectRequest = {
    kind: pluginNodeKindId(OWNER, kind),
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'idempotent',
    budget: 'effects',
    ...(mode === undefined ? {} : { mode }),
  };
  return handler(params, request, testRun());
}

describe('the watch action node in a run', () => {
  it('starts the picked workout on the watch and waits for what the watch says', async () => {
    outcome = { ok: true, detail: 'Workout started' };
    const result = await perform(
      'action',
      { watch: watchId, action: 'start_workout', sport: 'outdoor_running' },
      'wait_for_result',
    );
    expect(result).toEqual({ ok: true, value: { detail: 'Workout started' } });
    expect(asked).toMatchObject([
      { deviceId: watchId, action: { type: 'start_workout', sport: 'outdoor_running' } },
    ]);
  });

  it('turns find and stop finding into the two states of one find command', async () => {
    await perform('action', { watch: watchId, action: 'find_watch' }, 'wait_for_result');
    await perform('action', { watch: watchId, action: 'stop_finding' }, 'wait_for_result');
    expect(asked.map((call) => call.action)).toEqual([
      { type: 'find_watch', on: true },
      { type: 'find_watch', on: false },
    ]);
  });

  it('refuses to start a workout without a sport and asks nothing of the watch', async () => {
    const result = await perform(
      'action',
      { watch: watchId, action: 'start_workout' },
      'wait_for_result',
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(asked).toEqual([]);
  });

  it('gives the unreachable phone as its own error class with the real message', async () => {
    outcome = { ok: false, reason: 'unreachable', detail: 'Ann’s phone could not be reached' };
    expect(
      await perform('action', { watch: watchId, action: 'sync' }, 'wait_for_result'),
    ).toMatchObject({
      ok: false,
      class: 'Unreachable',
      message: 'Ann’s phone could not be reached',
      code: 'watch_unreachable',
    });
  });

  it('gives a phone that never answered as a timeout and a refusal as refused', async () => {
    outcome = { ok: false, reason: 'unanswered', detail: 'The phone did not answer' };
    expect(
      await perform('action', { watch: watchId, action: 'sync' }, 'wait_for_result'),
    ).toMatchObject({ ok: false, class: 'Timeout', code: 'watch_unanswered' });
    outcome = { ok: false, reason: 'refused', detail: 'The watch said no' };
    expect(
      await perform('action', { watch: watchId, action: 'sync' }, 'wait_for_result'),
    ).toMatchObject({ ok: false, class: 'Refused', message: 'The watch said no' });
  });

  it('reports a watch that was removed after the automation was written', async () => {
    expect(
      await perform('action', { watch: 'gone-watch', action: 'sync' }, 'wait_for_result'),
    ).toMatchObject({ ok: false, class: 'NotFound', code: 'watch_not_found' });
    expect(asked).toEqual([]);
  });

  it('sends without waiting when no mode is chosen', async () => {
    expect(await perform('action', { watch: watchId, action: 'sync' })).toEqual({
      ok: true,
      value: { sent: true },
    });
  });
});

describe('the watch alarm and face nodes in a run', () => {
  it('changes the alarm already at that time and keeps its smart wake', async () => {
    await perform(
      'alarm',
      { watch: watchId, time: '06:45', days: ['mon', 'tue'], on: false },
      'wait_for_result',
    );
    expect(asked[0]?.action).toEqual({
      type: 'save_alarm',
      alarm: { id: 3, time: '06:45', enabled: false, days: ['mon', 'tue'], smart: true },
    });
  });

  it('adds a new alarm at a time nothing rings at, once, switched on', async () => {
    await perform(
      'alarm',
      { watch: watchId, time: '07:30', days: [], on: true },
      'wait_for_result',
    );
    expect(asked[0]?.action).toEqual({
      type: 'save_alarm',
      alarm: { id: null, time: '07:30', enabled: true, days: [], smart: false },
    });
  });

  it('puts the picked face on the watch', async () => {
    await perform('face', { watch: watchId, face: 'face-2' }, 'wait_for_result');
    expect(asked[0]?.action).toEqual({ type: 'set_watch_face', id: 'face-2' });
  });
});

describe('the watch face picker served by the driver', () => {
  function faces(query: {
    q?: string;
    ids?: string;
  }): ReturnType<ReturnType<typeof createKindCatalog>['driverNodes']['options']> {
    const catalog = createKindCatalog();
    registerWatchAutomation(
      catalog,
      watchAutomationRuntime({
        store: opened.store,
        watches: {
          target: () => {
            throw new Error('not used');
          },
        },
        actions: { attempt: () => Promise.reject(new Error('not used')) },
      }),
    );
    return catalog.driverNodes.options('watch', 'face', query, CALLER);
  }

  it('lists the faces of the watches that are added and finds them by name', async () => {
    const all = await faces({});
    expect(all).toMatchObject({ state: 'ready' });
    expect(all?.state === 'ready' ? all.options.map((option) => option.id) : []).toEqual([
      'face-1',
      'face-2',
    ]);
    const found = await faces({ q: 'classic' });
    expect(found?.state === 'ready' ? found.options.map((option) => option.id) : []).toEqual([
      'face-2',
    ]);
  });

  it('is gone with the driver and unknown for other entities', () => {
    const catalog = createKindCatalog();
    expect(catalog.driverNodes.options('watch', 'face', {}, CALLER)).toBeUndefined();
    const stop = registerWatchAutomation(catalog, { tools: [], options: {} });
    expect(catalog.driverNodes.options('watch', 'face', {}, CALLER)).toBeUndefined();
    expect(catalog.driverNodes.options('watch', 'other', {}, CALLER)).toBeUndefined();
    stop();
  });
});
