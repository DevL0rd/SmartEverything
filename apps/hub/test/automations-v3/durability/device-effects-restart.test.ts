import { afterEach, describe, expect, it } from 'vitest';
import type { DeviceEffect, DeviceEffectTarget } from '@smarteverything/domain';
import { DeviceEffects } from '../../../src/commands/effects';
import { closeSetups, setup } from '../../support/executor-setup';
import { testLogger } from '../../support/logs';

afterEach(closeSetups);

const RUN = '4e000000-0000-4000-8000-000000000002';
const NODE = '4e000000-0000-4000-8000-000000000003';
const FIRST = '4e000000-0000-4000-8000-000000000001';

function held(device: string): DeviceEffectTarget {
  const effect: DeviceEffect = {
    id: FIRST,
    runId: RUN,
    nodeId: NODE,
    operation: { type: 'set', value: 20 },
    priority: 0,
    order: 1,
    expiresAt: '2026-10-08T13:00:00.000Z',
  };
  return {
    device_id: device,
    capability: 'brightness',
    base: 60,
    resolved: 20,
    effects: [effect],
    updated_at: '2026-10-08T12:00:00.000Z',
  };
}

describe('a restart during a device.set_temporarily region', () => {
  it('puts the device back to its base value and fails the open owned command without replaying it', async () => {
    const home = await setup();
    const { store } = home.db;
    store.deviceEffects.save(held(home.lampId));
    const [open] = store.commands.insert([
      {
        deviceId: home.lampId,
        capability: 'brightness',
        value: 20,
        source: 'automation',
        requestedBy: null,
      },
    ]);
    if (open === undefined) throw new Error('No command was stored.');
    const effects = new DeviceEffects(store, testLogger());
    effects.attach(home.executor);
    await effects.recover();
    await home.executor.settled();
    expect(store.commands.byId(open.id)).toMatchObject({
      status: 'failed',
      error: 'The hub stopped before this temporary change finished. It was not replayed.',
    });
    expect(store.deviceEffects.list()).toStrictEqual([]);
    expect(home.adapter.executed.map((command) => command.value)).toStrictEqual([60]);
  });
});
