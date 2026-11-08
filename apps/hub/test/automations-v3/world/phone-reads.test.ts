import { randomUUID } from 'node:crypto';
import type { DeviceRow, JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../../src/assistant/turn-authority';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { furnish, type Home } from './support';

let home: Home;
let phone: DeviceRow;

let OWNER = '';
let MEMBER = '';
let clientId = '';

beforeEach(async () => {
  home = await furnish();
  phone = home.motion;
  OWNER = home.test.store.profiles.first().id;
  MEMBER = home.test.store.profiles.create({ name: 'Ann' }).id;
  clientId = home.test.store.clients.create({
    name: 'Phone',
    platform: 'android',
    role: 'member',
    tokenHash: 'a'.repeat(64),
  }).id;
});

afterEach(async () => {
  await home.test.close();
});

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

function report(values: Readonly<Record<string, JsonValue>>): void {
  Object.entries(values).forEach(([capability, value]) => {
    home.write(phone, capability, value);
  });
}

function savePlace(profileId: string, place: string | null): void {
  home.test.store.phoneContexts.save({
    deviceId: phone.id,
    profileId,
    clientId,
    state: 'still',
    since: null,
    confidence: null,
    place,
    phoneInUse: null,
    reportedAt: '2026-10-25T10:00:00.000Z',
  });
}

const read = (): Readonly<Record<string, unknown>> =>
  home.read('phone.read', { phone: { phone: phone.id } }).outputs;

describe('phone.read', () => {
  it('reads every figure the phone reports under its output name', () => {
    report({
      battery: 64,
      charging: true,
      ringer_mode: 'vibrate',
      dnd: false,
      screen_on: true,
      phone_context: 'driving',
      network: 'cellular',
      wifi_on: false,
      bluetooth_on: true,
      location_on: true,
      airplane_mode: false,
      notification_count: 7,
      next_alarm: '2026-10-26T06:30:00.000Z',
      now_playing: 'Some song',
      screen_time_today: 95,
      in_call: false,
      ringing: false,
      power_save: true,
      thermal_state: 'light',
    });
    savePlace(OWNER, 'Home');
    expect(read()).toEqual({
      battery: 64,
      charging: true,
      ringerMode: 'vibrate',
      dnd: false,
      screenOn: true,
      context: 'driving',
      place: 'Home',
      network: 'cellular',
      wifiOn: false,
      bluetoothOn: true,
      locationOn: true,
      airplane: false,
      notificationCount: 7,
      nextAlarm: '2026-10-26T06:30:00.000Z',
      nowPlaying: 'Some song',
      screenTimeToday: 95,
      inCall: false,
      ringing: false,
      powerSave: true,
      thermal: 'light',
    });
  });

  it('leaves out what an old report never carried', () => {
    report({ battery: 30, charging: false });
    expect(read()).toEqual({ battery: 30, charging: false });
  });

  it('leaves out a null alarm, a null track and an unknown place', () => {
    report({ next_alarm: null, now_playing: null, in_call: true });
    savePlace(OWNER, null);
    expect(read()).toEqual({ inCall: true });
  });

  it('accepts the phone as a plain id and fails for one that does not exist', () => {
    report({ dnd: true });
    expect(home.read('phone.read', { phone: phone.id }).outputs).toEqual({ dnd: true });
    expect(() => home.read('phone.read', { phone: 'nope' })).toThrow(/no device nope/);
    expect(() => home.read('phone.read', {})).toThrow(/cannot read/);
  });

  it('shows a person everything of their own phone', () => {
    report({ now_playing: 'Mine', notification_count: 2 });
    savePlace(MEMBER, 'Work');
    const outputs = withExecutionAuthority(authority(MEMBER, 'member'), read);
    expect(outputs).toMatchObject({ place: 'Work', nowPlaying: 'Mine', notificationCount: 2 });
  });

  it('hides place and playing from the owner on another person phone', () => {
    report({ battery: 50, now_playing: 'Theirs', notification_count: 2, phone_context: 'walking' });
    savePlace(MEMBER, 'Work');
    const outputs = withExecutionAuthority(authority(OWNER, 'owner'), read);
    expect(outputs).toEqual({ battery: 50, notificationCount: 2, context: 'walking' });
  });

  it('hides everything private from another member', () => {
    report({
      battery: 50,
      now_playing: 'Theirs',
      notification_count: 2,
      phone_context: 'walking',
      screen_time_today: 10,
      wifi_on: true,
    });
    savePlace(OWNER, 'Home');
    const outputs = withExecutionAuthority(authority(MEMBER, 'member'), read);
    expect(outputs).toEqual({ battery: 50, wifiOn: true });
  });
});
