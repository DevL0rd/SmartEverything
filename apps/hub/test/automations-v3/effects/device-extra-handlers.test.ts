import { afterEach, describe, expect, it } from 'vitest';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { deviceExtraHandlers } from '../../../src/automations/engine-v3-effects-devices';
import { closeSetups, NOW, setup } from '../../support/executor-setup';
import { FakeClock } from '../../support/fake-clock';
import { testRun } from './support';

afterEach(closeSetups);

function requestOf(kind: string, params: EffectRequest['params']): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'idempotent',
    budget: 'command',
  };
}

async function handlers(): Promise<{
  calls: unknown[];
  home: Awaited<ReturnType<typeof setup>>;
  run: ReturnType<typeof deviceExtraHandlers>;
}> {
  const home = await setup();
  const calls: unknown[] = [];
  return {
    calls,
    home,
    run: deviceExtraHandlers({
      setter: {
        set: (request) => {
          calls.push(request.control);
          return Promise.resolve({ sent: [home.lampId], skipped: [], note: null });
        },
      },
      store: home.db.store,
      feed: home.db.store.feed,
      clock: new FakeClock(NOW.toISOString()),
    }),
  };
}

describe('device extra effect handlers', () => {
  it('captures the target as a scene, and refuses a duplicate name without overwrite', async () => {
    const { run, home } = await handlers();
    home.db.store.state.write([
      { deviceId: home.lampId, capability: 'power', value: true, observedAt: NOW.toISOString() },
    ]);
    const ask = { target: { device: home.lampId }, name: 'Evening' };
    const first = await run['scene.capture']?.(ask, requestOf('scene.capture', {}), testRun());
    expect(first).toMatchObject({ ok: true });
    expect(home.db.store.scenes.list().map((scene) => scene.name)).toEqual(['Evening']);
    const again = await run['scene.capture']?.(ask, requestOf('scene.capture', {}), testRun());
    expect(again).toMatchObject({ ok: false, class: 'Refused' });
  });

  it('registers the setter based kinds and scene capture', async () => {
    expect(Object.keys((await handlers()).run).sort()).toEqual([
      'device.ensure',
      'device.fade',
      'device.restore',
      'scene.capture',
    ]);
  });

  it('rejects bad parameters as Invalid before touching a device', async () => {
    const { run, calls } = await handlers();
    for (const kind of ['device.ensure', 'device.fade', 'device.restore']) {
      const handler = run[kind];
      const result = await handler?.({}, requestOf(kind, {}), testRun());
      expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    }
    expect(calls).toEqual([]);
  });

  it('refuses a fade with no start level and no readable current level', async () => {
    const { run, home } = await handlers();
    const result = await run['device.fade']?.(
      { target: { device: home.lampId }, control: 'brightness', to: 50, over: 1000 },
      requestOf('device.fade', {}),
      testRun(),
    );
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
  });

  it('restores a snapshot through the setter', async () => {
    const { run, calls, home } = await handlers();
    const result = await run['device.restore']?.(
      { snapshot: { [home.lampId]: { power: true, brightness: 20 } } },
      requestOf('device.restore', {}),
      testRun(),
    );
    expect(result).toMatchObject({ ok: true });
    expect(calls).toEqual(['brightness', 'power']);
  });
});
