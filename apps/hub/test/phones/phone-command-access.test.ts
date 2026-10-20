import { randomUUID } from 'node:crypto';
import { ApiError, type DeviceRow, type JsonValue } from '@smarteverything/domain';
import { MANIFEST, MANIFEST_SLOTS } from '@smarteverything/flow/compile/manifest';
import type { Manifest } from '@smarteverything/flow/compile/manifest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireReachableTargets } from '../../src/automations/service-reach';
import { requirePhoneAccess } from '../../src/server/handlers/scenes';
import type { Caller } from '../../src/server/auth';
import { checkedCommands, commandPrincipal, type CheckedInput } from '../../src/server/commands';
import { captureLogs } from '../support/logs';
import { addPerson, addPhoneDevice, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

let test: TestStore;
let dana: TestPerson;
let sam: TestPerson;
let owner: TestPerson;
let phone: DeviceRow;

beforeEach(async () => {
  captureLogs();
  test = await testStore();
  dana = addPerson(test, 'Dana', 'member');
  sam = addPerson(test, 'Sam', 'member');
  owner = addPerson(test, 'Owner', 'owner');
  phone = addPhoneDevice(test, {
    clientId: dana.client.id,
    profileId: dana.profileId,
    name: 'Dana phone',
  }).device;
});

afterEach(async () => {
  await test.close();
});

function caller(person: TestPerson): Caller {
  return { kind: 'client', client: person.client };
}

function send(person: TestPerson, capability: string, value: JsonValue): readonly unknown[] {
  const input: CheckedInput = {
    device_id: phone.id,
    capability,
    value,
    source: 'app',
    effect_policy: undefined,
  };
  return checkedCommands(test.store, [input], commandPrincipal(test.store, caller(person)));
}

function refusal(work: () => unknown): ApiError {
  try {
    work();
  } catch (cause) {
    if (cause instanceof ApiError) return cause;
    throw cause;
  }
  throw new Error('The command was not refused.');
}

describe('commanding a phone through device commands', () => {
  it.each([
    ['ring_volume', 40],
    ['alarm_volume', 40],
    ['notification_volume', 40],
    ['brightness', 40],
    ['auto_brightness', true],
    ['flashlight', 'on'],
    ['dnd', true],
    ['ringer_mode', 'silent'],
    ['screen_timeout', '60'],
    ['auto_rotate', false],
    ['haptic_feedback', false],
    ['touch_sounds', false],
  ])('refuses another member %s on someone else’s phone', (capability, value) => {
    const refused = refusal(() => send(sam, capability, value));
    expect(refused.code).toBe('forbidden');
    expect(refused.message).toBe('Only an owner can do this for another person.');
  });

  it('refuses another member launching an app or opening a link on someone else’s phone', () => {
    expect(refusal(() => send(sam, 'launch_app', 'com.a')).code).toBe('forbidden');
    expect(refusal(() => send(sam, 'open', 'https://example.com')).code).toBe('forbidden');
  });

  it('lets the phone’s own person and the owner change its sound and screen', () => {
    expect(send(dana, 'ring_volume', 40)).toHaveLength(1);
    expect(send(owner, 'brightness', 40)).toHaveLength(1);
  });

  it('lets the phone’s person and the owner change the screen timeout and the system toggles', () => {
    for (const person of [dana, owner]) {
      expect(send(person, 'screen_timeout', '300')).toHaveLength(1);
      expect(send(person, 'auto_rotate', false)).toHaveLength(1);
      expect(send(person, 'haptic_feedback', true)).toHaveLength(1);
      expect(send(person, 'touch_sounds', false)).toHaveLength(1);
    }
  });

  it('lets only the phone’s person open a settings page, not even the owner', () => {
    expect(send(dana, 'open_settings', 'write_settings')).toHaveLength(1);
    const byOwner = refusal(() => send(owner, 'open_settings', 'wifi'));
    expect(byOwner.code).toBe('forbidden');
    expect(byOwner.message).toBe('Only the person who owns this phone can do this.');
    const byMember = refusal(() => send(sam, 'open_settings', 'wifi'));
    expect(byMember.message).toBe('Only the person who owns this phone can do this.');
  });

  it('lets only the phone’s person launch an app, not even the owner', () => {
    expect(send(dana, 'launch_app', 'com.a')).toHaveLength(1);
    const refused = refusal(() => send(owner, 'launch_app', 'com.a'));
    expect(refused.message).toBe('Only the person who owns this phone can do this.');
  });

  it('lets the owner launch an app on the owner’s own phone', () => {
    const own = addPhoneDevice(test, {
      clientId: owner.client.id,
      profileId: owner.profileId,
      name: 'Owner phone',
    }).device;
    const input: CheckedInput = {
      device_id: own.id,
      capability: 'launch_app',
      value: 'com.a',
      source: 'app',
      effect_policy: undefined,
    };
    expect(
      checkedCommands(test.store, [input], commandPrincipal(test.store, caller(owner))),
    ).toHaveLength(1);
  });

  it('applies the same rule to an assistant turn of a member', () => {
    const service: Caller = {
      kind: 'service',
      authority: {
        event_id: randomUUID(),
        profile_id: sam.profileId,
        client_id: null,
        kind: 'service',
        role: 'member',
        hub_os_ban: false,
        tools: null,
        plugin_id: null,
        requester: null,
      },
      profileId: sam.profileId,
      chatId: null,
    };
    const input: CheckedInput = {
      device_id: phone.id,
      capability: 'ring_volume',
      value: 40,
      source: 'assistant',
      effect_policy: undefined,
    };
    expect(
      refusal(() => checkedCommands(test.store, [input], commandPrincipal(test.store, service)))
        .code,
    ).toBe('forbidden');
  });
});

describe('saving work that commands a phone', () => {
  const steps = (control: string): Manifest =>
    MANIFEST.parse({
      uses: Object.fromEntries(
        MANIFEST_SLOTS.map((slot) => [
          slot,
          slot === 'device' ? [phone.id] : slot === 'control' ? [control] : [],
        ]),
      ),
      dynamic: [],
      budgets: [],
      ai: false,
      owner: false,
      missing: [],
    });

  it('refuses a member automation that sets sound on someone else’s phone', () => {
    expect(
      refusal(() => {
        requireReachableTargets(test.store, caller(sam), steps('ring_volume'));
      }).code,
    ).toBe('forbidden');
  });

  it('accepts the phone person’s own automation and the owner’s', () => {
    expect(() => {
      requireReachableTargets(test.store, caller(dana), steps('ring_volume'));
    }).not.toThrow();
    expect(() => {
      requireReachableTargets(test.store, caller(owner), steps('ring_volume'));
    }).not.toThrow();
  });

  it('refuses an owner automation that opens a settings page on someone else’s phone', () => {
    const actions = [{ deviceId: phone.id, capability: 'open_settings', value: 'wifi' }];
    expect(
      refusal(() => {
        requirePhoneAccess(test.store, caller(owner), actions);
      }).message,
    ).toBe('Only the person who owns this phone can do this.');
    expect(() => {
      requirePhoneAccess(test.store, caller(dana), actions);
    }).not.toThrow();
  });

  it('refuses a member scene that sets sound on someone else’s phone', () => {
    const actions = [{ deviceId: phone.id, capability: 'ring_volume', value: 40 }];
    expect(
      refusal(() => {
        requirePhoneAccess(test.store, caller(sam), actions);
      }).code,
    ).toBe('forbidden');
    expect(() => {
      requirePhoneAccess(test.store, caller(dana), actions);
    }).not.toThrow();
  });
});
