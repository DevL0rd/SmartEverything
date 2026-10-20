import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_CATALOGUE,
  PHONE_ACTION,
  PHONE_DIRECT_ACTION,
  PHONE_PUSHED_ACTION,
  PHONE_SCREEN_TIMEOUTS,
  PHONE_SCREEN_TIMEOUT_OPTIONS,
  PHONE_SETTINGS_PAGES,
  PHONE_SYSTEM_TOGGLES,
  PHONE_VALUES,
  machineActionOfPhoneAction,
  phoneActionAllowed,
  phoneActionPersonOnly,
} from '../src';

const SETTING_KEYS = [
  'screen_timeout',
  'auto_rotate',
  'haptic_feedback',
  'touch_sounds',
  'wifi_on',
  'bluetooth_on',
  'location_on',
  'airplane_mode',
  'open_settings',
] as const;

describe('the system toggle action', () => {
  it.each(PHONE_SYSTEM_TOGGLES)('accepts %s on and off', (setting) => {
    for (const on of [true, false]) {
      expect(PHONE_DIRECT_ACTION.parse({ type: 'set_system_toggle', setting, on })).toEqual({
        type: 'set_system_toggle',
        setting,
        on,
      });
    }
  });

  it('offers exactly the three settings an app may write', () => {
    expect([...PHONE_SYSTEM_TOGGLES]).toEqual(['auto_rotate', 'haptic_feedback', 'touch_sounds']);
  });

  it.each(['wifi', 'bluetooth_on', 'airplane_mode', 'secure_key', 'screen_off_timeout', ''])(
    'refuses %s because it is not one of the three',
    (setting) => {
      expect(PHONE_ACTION.safeParse({ type: 'set_system_toggle', setting, on: true }).success).toBe(
        false,
      );
    },
  );

  it('refuses a toggle without a boolean, and any extra field', () => {
    const base = { type: 'set_system_toggle', setting: 'auto_rotate' };
    expect(PHONE_ACTION.safeParse(base).success).toBe(false);
    expect(PHONE_ACTION.safeParse({ ...base, on: 'yes' }).success).toBe(false);
    expect(
      PHONE_ACTION.safeParse({ ...base, on: true, key: 'accelerometer_rotation' }).success,
    ).toBe(false);
  });
});

describe('the open settings action', () => {
  it.each(PHONE_SETTINGS_PAGES)('accepts the page %s', (page) => {
    expect(PHONE_DIRECT_ACTION.parse({ type: 'open_settings', page })).toEqual({
      type: 'open_settings',
      page,
    });
  });

  it('names a closed table of twelve pages', () => {
    expect([...PHONE_SETTINGS_PAGES]).toEqual([
      'wifi',
      'bluetooth',
      'internet',
      'location',
      'airplane',
      'nfc',
      'battery_saver',
      'display',
      'sound',
      'dnd_access',
      'write_settings',
      'app_details',
    ]);
  });

  it.each([
    'android.settings.WIFI_SETTINGS',
    'android.settings.ACTION_BATTERY_SAVER_SETTINGS',
    'accelerometer_rotation',
    'dark_mode',
    'WIFI',
    '',
  ])('refuses %s because it is not a listed page', (page) => {
    expect(PHONE_ACTION.safeParse({ type: 'open_settings', page }).success).toBe(false);
  });

  it('refuses a raw key, an intent or a value next to the page', () => {
    expect(
      PHONE_ACTION.safeParse({ type: 'open_settings', page: 'wifi', intent: 'x' }).success,
    ).toBe(false);
    expect(
      PHONE_ACTION.safeParse({ type: 'open_settings', key: 'wifi_on', value: 1 }).success,
    ).toBe(false);
    expect(PHONE_ACTION.safeParse({ type: 'open_settings' }).success).toBe(false);
  });

  it('reaches the phone as a pushed action and is not a machine action', () => {
    const action = { type: 'open_settings', page: 'write_settings' } as const;
    expect(PHONE_PUSHED_ACTION.parse(action)).toEqual(action);
    expect(machineActionOfPhoneAction(action)).toBeNull();
    expect(
      machineActionOfPhoneAction({ type: 'set_system_toggle', setting: 'auto_rotate', on: true }),
    ).toBeNull();
  });
});

describe('the screen timeout', () => {
  it('lists each action choice as a text option', () => {
    expect(PHONE_SCREEN_TIMEOUT_OPTIONS).toEqual(PHONE_SCREEN_TIMEOUTS.map(String));
  });

  it.each(PHONE_SCREEN_TIMEOUT_OPTIONS)('accepts the reported timeout %s', (seconds) => {
    expect(PHONE_VALUES.parse({ screen_timeout: seconds })).toEqual({ screen_timeout: seconds });
  });

  it.each(['45', '0', '3600', 'never', '', '60 '])(
    'refuses the reported timeout %j outside the choices',
    (seconds) => {
      expect(PHONE_VALUES.safeParse({ screen_timeout: seconds }).success).toBe(false);
    },
  );

  it('still refuses a set_timeout outside the choices', () => {
    expect(PHONE_ACTION.safeParse({ type: 'set_timeout', seconds: 45 }).success).toBe(false);
    expect(PHONE_ACTION.safeParse({ type: 'set_timeout', seconds: 1800 }).success).toBe(true);
  });
});

describe('the reported setting values', () => {
  it('takes plain booleans for the four read-only phone settings', () => {
    const values = { wifi_on: true, bluetooth_on: false, location_on: true, airplane_mode: false };
    expect(PHONE_VALUES.parse(values)).toEqual(values);
    expect(PHONE_VALUES.safeParse({ wifi_on: 'on' }).success).toBe(false);
    expect(PHONE_VALUES.safeParse({ airplane_mode: 1 }).success).toBe(false);
  });

  it.each(SETTING_KEYS)('catalogues %s so automations, search and the AI see it', (key) => {
    expect(key in CAPABILITY_CATALOGUE).toBe(true);
    expect(CAPABILITY_CATALOGUE[key].keywords.length).toBeGreaterThan(0);
  });
});

describe('who may use the setting actions', () => {
  it('lets only the phone person open a settings page, owner included', () => {
    expect(phoneActionPersonOnly('open_settings')).toBe(true);
    expect(phoneActionAllowed('open_settings', 'person')).toBe(true);
    expect(phoneActionAllowed('open_settings', 'owner')).toBe(false);
    expect(phoneActionAllowed('open_settings', 'member')).toBe(false);
  });

  it('lets the person and an owner flip a toggle, never another member', () => {
    expect(phoneActionPersonOnly('set_system_toggle')).toBe(false);
    expect(phoneActionAllowed('set_system_toggle', 'person')).toBe(true);
    expect(phoneActionAllowed('set_system_toggle', 'owner')).toBe(true);
    expect(phoneActionAllowed('set_system_toggle', 'member')).toBe(false);
  });

  it('treats the screen timeout like brightness', () => {
    for (const tier of ['person', 'owner', 'member'] as const) {
      expect(phoneActionAllowed('set_timeout', tier)).toBe(
        phoneActionAllowed('set_brightness', tier),
      );
    }
  });
});
