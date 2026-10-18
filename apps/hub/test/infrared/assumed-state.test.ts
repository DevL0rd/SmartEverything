import type { DeviceCapability, JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IrAssumedState } from '../../src/infrared/assumed-state';
import type { DeviceUpsert } from '../../src/database/port';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = '2026-10-18T14:00:00.000Z';

let opened: TestStore;
let tracker: IrAssumedState;
let stop: () => void;

const KEYS: DeviceCapability = {
  key: 'remote_key',
  label: 'Key',
  access: 'write',
  value: { kind: 'enum', options: ['Power', 'Temp+', 'Temp-', 'Cool', 'Heat'] },
};

function device(overrides: Partial<DeviceUpsert>): DeviceUpsert {
  return {
    provider: 'tuya',
    externalId: 'x',
    parentId: null,
    kind: 'ir_blaster',
    name: 'Living room IR',
    model: 'ir',
    manufacturer: 'Tuya',
    providerRoom: null,
    roomId: null,
    online: true,
    capabilities: [],
    details: {},
    ...overrides,
  };
}

function stored(row: DeviceUpsert): string {
  const [saved] = opened.store.devices.upsert([row]);
  if (saved === undefined) throw new Error('The device was not stored.');
  return saved.id;
}

function succeed(deviceId: string, capability: string, value: JsonValue): void {
  const [row] = opened.store.commands.insert([
    {
      deviceId,
      capability,
      value,
      source: 'app',
      requestedBy: null,
    },
  ]);
  if (row === undefined) throw new Error('The command was not stored.');
  opened.store.commands.finish(row.id, { status: 'succeeded', result: null });
}

function fail(deviceId: string, capability: string, value: JsonValue): void {
  const [row] = opened.store.commands.insert([
    { deviceId, capability, value, source: 'app', requestedBy: null },
  ]);
  if (row === undefined) throw new Error('The command was not stored.');
  opened.store.commands.finish(row.id, { status: 'failed', error: 'no answer' });
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore(() => new Date(NOW));
  tracker = new IrAssumedState({
    store: opened.store,
    now: (): Date => new Date(NOW),
    log: testLogger('infrared'),
  });
  stop = opened.store.feed.subscribe((change): void => {
    tracker.observe(change);
  });
});

afterEach(async () => {
  stop();
  await opened.close();
});

describe('what an IR remote is assumed to be doing', () => {
  it('follows the keys a library remote sent', () => {
    const blaster = stored(device({ externalId: 'b' }));
    const remote = stored(
      device({
        externalId: 'r',
        kind: 'ir_remote',
        name: 'Living room AC',
        parentId: blaster,
        capabilities: [KEYS],
      }),
    );
    succeed(remote, 'remote_key', 'Power');
    succeed(remote, 'remote_key', 'Temp-');
    succeed(remote, 'remote_key', 'Heat');
    expect(opened.store.settings.irRemote(remote)).toEqual({
      on: true,
      temp: 23,
      mode: 'Heat',
      speed: null,
      muted: null,
      sentKey: 'Heat',
      sentAt: NOW,
      recent: [NOW, NOW, NOW],
      checkDeviceId: null,
    });
  });

  it('ignores a key that failed', () => {
    const remote = stored(device({ externalId: 'r', kind: 'ir_remote', capabilities: [KEYS] }));
    fail(remote, 'remote_key', 'Power');
    expect(opened.store.settings.read().ir_remotes).toEqual({});
  });

  it('follows the code a blaster sent for the learned remote that owns it', () => {
    const blaster = stored(device({ externalId: 'b' }));
    const fan = opened.store.infrared.addRemote({
      blaster_id: blaster,
      name: 'Fan',
      category: 'fan',
      brand: null,
    });
    const tv = opened.store.infrared.addRemote({
      blaster_id: blaster,
      name: 'Speaker',
      category: 'audio',
      brand: null,
    });
    opened.store.infrared.saveCode({
      remote_id: fan.id,
      button: 'Speed up',
      format: 'pulses',
      code: 'AAA',
    });
    opened.store.infrared.saveCode({
      remote_id: tv.id,
      button: 'Mute',
      format: 'pulses',
      code: 'BBB',
    });
    succeed(blaster, 'ir_send', { format: 'pulses', code: 'AAA' });
    succeed(blaster, 'ir_send', { format: 'pulses', code: 'BBB' });
    expect(opened.store.settings.irRemote(fan.id)).toMatchObject({ speed: 1, sentKey: 'Speed up' });
    expect(opened.store.settings.irRemote(tv.id)).toMatchObject({ muted: true, sentKey: 'Mute' });
  });

  it('does not guess when two remotes learned the same code', () => {
    const blaster = stored(device({ externalId: 'b' }));
    const first = opened.store.infrared.addRemote({
      blaster_id: blaster,
      name: 'One',
      category: 'fan',
      brand: null,
    });
    const second = opened.store.infrared.addRemote({
      blaster_id: blaster,
      name: 'Two',
      category: 'fan',
      brand: null,
    });
    for (const remote of [first, second]) {
      opened.store.infrared.saveCode({
        remote_id: remote.id,
        button: 'Power',
        format: 'pulses',
        code: 'SAME',
      });
    }
    succeed(blaster, 'ir_send', { format: 'pulses', code: 'SAME' });
    expect(opened.store.settings.read().ir_remotes).toEqual({});
  });

  it('leaves other devices and other commands alone', () => {
    const plug = stored(device({ externalId: 'p', kind: 'plug' }));
    succeed(plug, 'remote_key', 'Power');
    const blaster = stored(device({ externalId: 'b' }));
    succeed(blaster, 'ir_send', { nonsense: true });
    expect(opened.store.settings.read().ir_remotes).toEqual({});
  });

  it('keeps a correction made by a person and forgets a removed remote', () => {
    const blaster = stored(device({ externalId: 'b' }));
    const remote = opened.store.infrared.addRemote({
      blaster_id: blaster,
      name: 'Fan',
      category: 'fan',
      brand: null,
    });
    opened.store.settings.setIrRemote(remote.id, { on: false, checkDeviceId: blaster });
    expect(opened.store.settings.irRemote(remote.id)).toMatchObject({
      on: false,
      checkDeviceId: blaster,
    });
    opened.store.settings.forgetIrRemote(remote.id);
    expect(opened.store.settings.read().ir_remotes).toEqual({});
    opened.store.settings.forgetIrRemote(remote.id);
    expect(opened.store.settings.read().ir_remotes).toEqual({});
  });
});
