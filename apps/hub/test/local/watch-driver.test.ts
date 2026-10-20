import {
  CommandRefusedError,
  DEVICE_ROW,
  DISCOVERED_DEVICE,
  type DeviceCommand,
  type DeviceRow,
  type WatchActionRequest,
  type WatchActionResult,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { watchActionOfCommand, watchDriver } from '../../src/local/watch-driver';
import type { WatchActionTarget } from '../../src/local/watch-actions';
import { xiaomiWatchDriver } from '../../src/local/xiaomi-watch';
import type { LocalDeviceEntry } from '../../src/store/repositories/local-devices';

const EXTERNAL_ID = 'xiaomi_watch:AA:BB:CC:DD:EE:FF';

const TARGET: WatchActionTarget = {
  deviceId: '6f1d9d3e-1c0a-4c55-9a43-5d2f1f2b9c11',
  profileId: '0b0f7a5e-3d1e-4f4a-8a0e-0d7e6d6a1b22',
  name: 'Xiaomi Watch S5 46mm',
  bridgeClientId: null,
};

const DEVICE: DeviceRow = DEVICE_ROW.parse({
  id: TARGET.deviceId,
  provider: 'local',
  external_id: EXTERNAL_ID,
  parent_id: null,
  kind: 'other',
  name: TARGET.name,
  display_name: null,
  model: 'miwear.watch.p62g',
  manufacturer: 'xiaomi',
  provider_room: null,
  room_id: null,
  online: true,
  capabilities: [],
  details: {},
  hidden: false,
  favourite: false,
  position: 0,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
});

function command(capability: DeviceCommand['capability'], value: string): DeviceCommand {
  return { commandId: 'c1', externalId: EXTERNAL_ID, capability, value };
}

function driverAnswering(result: WatchActionResult): {
  readonly driver: ReturnType<typeof watchDriver>;
  readonly sent: WatchActionRequest[];
} {
  const sent: WatchActionRequest[] = [];
  const driver = watchDriver({
    store: {
      devices: {
        byExternal: (provider: string, externalId: string): DeviceRow | undefined =>
          provider === 'local' && externalId === EXTERNAL_ID ? DEVICE : undefined,
      },
    },
    watches: { target: (): WatchActionTarget => TARGET },
    actions: {
      run: (_target, action): Promise<WatchActionResult> => {
        sent.push(action);
        return Promise.resolve(result);
      },
    },
  });
  return { driver, sent };
}

describe('watchActionOfCommand', () => {
  it('starts the chosen sport', () => {
    expect(watchActionOfCommand('watch_workout_start', 'treadmill')).toEqual({
      type: 'start_workout',
      sport: 'treadmill',
    });
  });

  it('maps pause, resume and finish to the watch workout actions', () => {
    expect(watchActionOfCommand('watch_workout_control', 'pause')).toEqual({
      type: 'pause_workout',
    });
    expect(watchActionOfCommand('watch_workout_control', 'resume')).toEqual({
      type: 'resume_workout',
    });
    expect(watchActionOfCommand('watch_workout_control', 'finish')).toEqual({
      type: 'stop_workout',
    });
  });

  it('refuses a capability the watch does not take', () => {
    expect(() => watchActionOfCommand('power', true)).toThrow(CommandRefusedError);
  });

  it('refuses a sport the app does not know', () => {
    expect(() => watchActionOfCommand('watch_workout_start', 'skiing')).toThrow();
  });
});

describe('watchDriver', () => {
  it('sends the action to the watch phone and returns its answer', async () => {
    const { driver, sent } = driverAnswering({ ok: true, detail: 'Paused the workout.' });
    await expect(driver.execute(command('watch_workout_control', 'pause'))).resolves.toBe(
      'Paused the workout.',
    );
    expect(sent).toEqual([{ type: 'pause_workout' }]);
  });

  it('fails the command with the phone’s reason when the watch refuses', async () => {
    const { driver } = driverAnswering({
      ok: false,
      detail: 'No workout is running on the watch.',
    });
    await expect(driver.execute(command('watch_workout_control', 'resume'))).rejects.toThrow(
      'No workout is running on the watch.',
    );
  });
});

describe('the watch description', () => {
  const entry: LocalDeviceEntry = {
    externalId: EXTERNAL_ID,
    driver: 'xiaomi_watch',
    address: 'AA:BB:CC:DD:EE:FF',
    name: TARGET.name,
    config: { model: 'miwear.watch.p62g' },
    createdAt: '2026-10-01T00:00:00.000Z',
  };

  function keysOf(observed: Parameters<typeof xiaomiWatchDriver.describe>[1]): string[] {
    const device = DISCOVERED_DEVICE.parse(xiaomiWatchDriver.describe(entry, observed));
    return device.capabilities.map((capability) => capability.key);
  }

  it('offers starting only the sports the watch reported', () => {
    const config = { settings: [], alarms: [], faces: [], goals: [], sports: ['treadmill'] };
    const device = DISCOVERED_DEVICE.parse(xiaomiWatchDriver.describe(entry, { config }));
    expect(device.capabilities.find((c) => c.key === 'watch_workout_start')?.value).toEqual({
      kind: 'enum',
      options: ['treadmill'],
    });
  });

  it('leaves out starting a workout until the watch has reported its sports', () => {
    expect(keysOf({})).toEqual(['watch_workout', 'watch_workout_control']);
  });
});
