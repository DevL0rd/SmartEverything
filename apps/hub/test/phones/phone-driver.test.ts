import { CommandRefusedError, type DeviceCommand, type PhoneAction } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { phoneDriver } from '../../src/phones/phone-driver';
import { phoneExternalId } from '../../src/phones/phone-device';
import { captureLogs } from '../support/logs';
import { idlePhoneNodes } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const CLIENT = '3d000000-0000-4000-8000-000000000031';

let test: TestStore;
let ran: { readonly clientId: string; readonly name: string; readonly action: PhoneAction }[];

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  ran = [];
  test.store.devices.upsert([
    {
      provider: 'local',
      externalId: phoneExternalId(CLIENT),
      parentId: null,
      kind: 'phone',
      name: 'Pixel',
      model: 'm',
      manufacturer: 'Google',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
});

afterEach(async () => {
  await test.close();
});

function driver(): ReturnType<typeof phoneDriver> {
  return phoneDriver({
    store: test.store,
    phones: idlePhoneNodes(test),
    originOf: () => ({ source: 'app', client: null }),
    now: () => new Date('2026-10-18T10:00:00.000Z'),
    actions: {
      run: (target, action) => {
        ran.push({ ...target, action });
        return Promise.resolve({ ok: true, detail: 'done' });
      },
    },
  });
}

function command(
  externalId: string,
  capability: DeviceCommand['capability'],
  value: DeviceCommand['value'],
): DeviceCommand {
  return { commandId: '4d000000-0000-4000-8000-000000000041', externalId, capability, value };
}

describe('the phone driver', () => {
  it('sends the action to the paired phone found by its external id, not by scanning devices', async () => {
    const devices = vi.spyOn(test.store.devices, 'list');
    const result = await driver().execute(command(phoneExternalId(CLIENT), 'dnd', true));
    expect(result).toBe('done');
    expect(ran).toEqual([
      { clientId: CLIENT, name: 'Pixel', action: { type: 'set_dnd', on: true } },
    ]);
    expect(devices).not.toHaveBeenCalled();
  });

  it.each([
    ['ring_volume', 40, { type: 'set_volume', stream: 'ring', percent: 40 }],
    ['alarm_volume', 55, { type: 'set_volume', stream: 'alarm', percent: 55 }],
    ['notification_volume', 20, { type: 'set_volume', stream: 'notification', percent: 20 }],
    ['brightness', 70, { type: 'set_brightness', percent: 70 }],
    ['auto_brightness', false, { type: 'set_auto_brightness', on: false }],
    ['flashlight', 'toggle', { type: 'flashlight', mode: 'toggle' }],
    ['screen_timeout', '120', { type: 'set_timeout', seconds: 120 }],
    ['auto_rotate', false, { type: 'set_system_toggle', setting: 'auto_rotate', on: false }],
    ['haptic_feedback', true, { type: 'set_system_toggle', setting: 'haptic_feedback', on: true }],
    ['touch_sounds', false, { type: 'set_system_toggle', setting: 'touch_sounds', on: false }],
    ['open_settings', 'wifi', { type: 'open_settings', page: 'wifi' }],
    ['open_settings', 'write_settings', { type: 'open_settings', page: 'write_settings' }],
  ] as const)('sets %s through the phone action it maps to', async (capability, value, action) => {
    await driver().execute(command(phoneExternalId(CLIENT), capability, value));
    expect(ran.map((sent) => sent.action)).toEqual([action]);
  });

  it('refuses a value the phone action does not accept', async () => {
    await expect(
      driver().execute(command(phoneExternalId(CLIENT), 'brightness', 140)),
    ).rejects.toThrow();
    expect(ran).toEqual([]);
  });

  it.each([
    ['screen_timeout', '45'],
    ['screen_timeout', 'never'],
    ['auto_rotate', 'yes'],
    ['open_settings', 'android.settings.WIFI_SETTINGS'],
    ['open_settings', 'dark_mode'],
  ] as const)('refuses %s with %s before anything reaches the phone', async (capability, value) => {
    await expect(
      driver().execute(command(phoneExternalId(CLIENT), capability, value)),
    ).rejects.toThrow();
    expect(ran).toEqual([]);
  });

  it.each(['wifi_on', 'bluetooth_on', 'location_on', 'airplane_mode', 'power_save'] as const)(
    'refuses to switch %s because no app can on Android',
    async (capability) => {
      await expect(
        driver().execute(command(phoneExternalId(CLIENT), capability, true)),
      ).rejects.toThrow(/cannot change this/);
      expect(ran).toEqual([]);
    },
  );

  it('hands the phone refusal about modifying system settings back unchanged', async () => {
    const refusal = 'Modify system settings is not allowed for SmartEverything on this phone';
    const refused = phoneDriver({
      store: test.store,
      phones: idlePhoneNodes(test),
      originOf: () => ({ source: 'app', client: null }),
      now: () => new Date('2026-10-18T10:00:00.000Z'),
      actions: { run: () => Promise.resolve({ ok: false, detail: refusal }) },
    });
    await expect(
      refused.execute(command(phoneExternalId(CLIENT), 'auto_rotate', true)),
    ).rejects.toThrow(refusal);
  });

  it('refuses to change what a phone only reports', async () => {
    await expect(
      driver().execute(command(phoneExternalId(CLIENT), 'charger', 'usb')),
    ).rejects.toThrow(/cannot change this/);
  });

  it('refuses a phone that is no longer paired', async () => {
    await expect(
      driver().execute(
        command(phoneExternalId('5d000000-0000-4000-8000-000000000051'), 'dnd', true),
      ),
    ).rejects.toThrow(CommandRefusedError);
    expect(ran).toEqual([]);
  });

  it('refuses an external id that is not a phone', async () => {
    await expect(driver().execute(command('lamp-1', 'dnd', true))).rejects.toThrow(
      /is not a phone/,
    );
  });
});
