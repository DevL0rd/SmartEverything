import {
  CommandRefusedError,
  PHONE_REPORT,
  type DeviceCommand,
  type DeviceEvent,
  type PhoneAction,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describePhone, phoneExternalId } from '../../src/phones/phone-device';
import { phoneDriver } from '../../src/phones/phone-driver';
import { captureLogs } from '../support/logs';
import { idlePhoneNodes } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const CLIENT = '3d000000-0000-4000-8000-000000000031';
const IDENTITY = {
  clientId: CLIENT,
  name: 'Pixel',
  profileId: '6d000000-0000-4000-8000-000000000061',
};

let test: TestStore;
let ran: PhoneAction[];
let events: DeviceEvent[];

function reported(actions: readonly unknown[]): ReturnType<typeof describePhone> {
  const report = PHONE_REPORT.parse({
    at: '2026-10-18T10:00:00.000Z',
    values: {},
    events: [],
    actions,
  });
  return describePhone(IDENTITY, {
    actions: report.actions ?? [],
    permissions: report.permissions ?? [],
    features: [],
  });
}

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  ran = [];
  events = [];
});

afterEach(async () => {
  await test.close();
});

function save(actions: readonly unknown[]): void {
  const device = reported(actions);
  test.store.devices.upsert([
    {
      provider: device.provider,
      externalId: device.externalId,
      parentId: null,
      kind: device.kind,
      name: device.name,
      model: device.model,
      manufacturer: device.manufacturer,
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: device.capabilities,
      details: device.details,
    },
  ]);
}

function execute(
  capability: DeviceCommand['capability'],
  value: DeviceCommand['value'],
): Promise<unknown> {
  return phoneDriver({
    store: test.store,
    phones: idlePhoneNodes(test, (event) => events.push(event)),
    originOf: () => ({ source: 'assistant', client: 'Owner phone' }),
    now: () => new Date('2026-10-18T10:00:00.000Z'),
    actions: {
      run: (_target, action) => {
        ran.push(action);
        return Promise.resolve({ ok: true, detail: 'done' });
      },
    },
  }).execute({
    commandId: '4d000000-0000-4000-8000-000000000041',
    externalId: phoneExternalId(CLIENT),
    capability,
    value,
  });
}

describe('which machine actions a phone offers', () => {
  it('keeps ring and flashlight and adds only what the phone reported as usable', () => {
    const keys = (device: ReturnType<typeof reported>): string[] =>
      device.capabilities.map((capability) => capability.key);
    expect(keys(reported([]))).toEqual(expect.arrayContaining(['ring', 'flashlight']));
    expect(keys(reported([]))).not.toContain('lock_screen');
    const offered = keys(
      reported([
        { action: 'lock', state: 'ready' },
        {
          action: 'launch_app',
          state: 'needs_permission',
          permission: 'android_overlay',
          reason: 'Android needs permission to open apps.',
        },
        { action: 'show_unlock', state: 'unsupported', reason: 'No secure lock screen.' },
      ]),
    );
    expect(offered).toEqual(expect.arrayContaining(['lock_screen', 'launch_app']));
    expect(offered).not.toContain('show_unlock');
  });
});

describe('machine actions through the phone driver (fake push)', () => {
  it('maps each reported action to the phone action it sends', async () => {
    save([
      { action: 'stop_ring', state: 'ready' },
      { action: 'lock', state: 'ready' },
      { action: 'show_unlock', state: 'ready' },
      { action: 'launch_app', state: 'ready' },
      { action: 'open', state: 'ready' },
    ]);
    await execute('stop_ring', null);
    await execute('lock_screen', null);
    await execute('show_unlock', null);
    await execute('launch_app', 'com.android.chrome');
    await execute('open', 'https://example.com/a');
    expect(ran).toEqual([
      { type: 'ring', on: false },
      { type: 'lock' },
      { type: 'show_unlock' },
      { type: 'launch_app', app: 'com.android.chrome' },
      { type: 'open_url', url: 'https://example.com/a', label: 'example.com' },
    ]);
  });

  it('records who asked for each machine action in the device event feed', async () => {
    save([
      { action: 'lock', state: 'ready' },
      { action: 'launch_app', state: 'ready' },
    ]);
    await execute('lock_screen', null);
    await execute('launch_app', 'Chrome');
    await execute('brightness', 40);
    expect(events).toEqual([
      {
        externalId: phoneExternalId(CLIENT),
        kind: 'machine_action',
        occurredAt: '2026-10-18T10:00:00.000Z',
        details: { action: 'lock', source: 'assistant', client: 'Owner phone' },
      },
      {
        externalId: phoneExternalId(CLIENT),
        kind: 'machine_action',
        occurredAt: '2026-10-18T10:00:00.000Z',
        details: { action: 'launch_app', source: 'assistant', client: 'Owner phone' },
      },
    ]);
  });

  it('says which permission is missing and sends nothing', async () => {
    save([
      {
        action: 'lock',
        state: 'needs_permission',
        permission: 'android_accessibility',
        reason: 'Locking needs the accessibility service.',
      },
    ]);
    await expect(execute('lock_screen', null)).rejects.toThrow(
      'Grant "SmartEverything accessibility service" on that machine.',
    );
    expect(ran).toEqual([]);
  });

  it('refuses an action the phone never reported', async () => {
    save([]);
    await expect(execute('launch_app', 'x')).rejects.toThrow(CommandRefusedError);
    expect(ran).toEqual([]);
  });

  it('refuses to open a file on a phone and a text that is not a link', async () => {
    save([{ action: 'open', state: 'ready' }]);
    await expect(execute('open', '/home/me/a.pdf')).rejects.toThrow('send a file');
    await expect(execute('open', 'not a link')).rejects.toThrow(CommandRefusedError);
    expect(ran).toEqual([]);
  });
});
