import { NODE_REGISTRY, type DiscoveredDevice } from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { afterEach, describe, expect, it } from 'vitest';
import type { HubTool, HubToolResult } from '../../../src/ai-tools/hub-tool';
import type { ToolCheck } from '../../../src/ai-tools/tool-hub';
import { phoneEffects } from '../../../src/automations/effects/phone-nodes';
import { Inventory } from '../../../src/state/inventory';
import { testDatabase, type TestDatabase } from '../../support/database';
import { NOW } from '../../support/executor-setup';
import { LAMP } from '../../support/fake-provider';
import { testRun } from './support';

const OWNER = '11111111-1111-4111-8111-111111111111';
const ALICE = '22222222-2222-4222-8222-222222222222';
const BOB = '33333333-3333-4333-8333-333333333333';

const TOOL: HubTool = {
  name: 'x',
  title: 'X',
  description: 'x',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  origin: { kind: 'se' },
  humanOnly: false,
};

const open: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((db) => db.close()));
});

interface Sent {
  readonly deviceId: unknown;
  readonly body: unknown;
  readonly profileId: string;
}

interface Rig {
  readonly id: (name: string) => string;
  readonly sent: Sent[];
  readonly answer: (result: unknown) => void;
  readonly hold: () => (result?: unknown) => void;
  readonly run: (
    kind: string,
    params: EffectRequest['params'],
    mode?: EffectRequest['mode'],
  ) => Promise<NodeResult>;
}

function device(name: string, kind: DiscoveredDevice['kind'], owner?: string): DiscoveredDevice {
  return {
    ...LAMP,
    externalId: name,
    name,
    kind,
    capabilities: [],
    details: owner === undefined ? {} : { profileId: owner },
  };
}

function request(
  kind: string,
  params: EffectRequest['params'],
  mode?: EffectRequest['mode'],
): EffectRequest {
  return {
    kind,
    node: { id: 'n', key: 'n' },
    path: 'n',
    activation: '0',
    key: 'n',
    params,
    retry: 'external',
    budget: 'effects',
    ...(mode === undefined ? {} : { mode }),
  };
}

async function home(): Promise<Rig> {
  const db = await testDatabase(NOW);
  open.push(db);
  const inventory = new Inventory(db.database, {
    onlineChanged: (): void => undefined,
    devicesChanged: (): void => undefined,
    lifecycle: (): void => undefined,
  });
  const devices = [
    device('Alice phone', 'phone', ALICE),
    device('Alice tablet', 'phone', ALICE),
    device('Bob phone', 'phone', BOB),
    device('Desk lamp', 'light'),
  ];
  await inventory.apply('xiaomi', devices);
  const id = (name: string): string => {
    const found = devices.find((each) => each.name === name);
    const row = found === undefined ? undefined : inventory.deviceOf('xiaomi', found.externalId);
    if (row === undefined) throw new Error(`${name} is not in the test home`);
    return row.id;
  };
  const sent: Sent[] = [];
  let reply: unknown = { ok: true };
  let gate: Promise<unknown> | null = null;
  const handlers = phoneEffects({
    store: db.store,
    ownerProfileId: () => OWNER,
    tools: {
      check: (): ToolCheck => ({ ok: true, tool: TOOL }),
      call: async (_name, args, caller): Promise<HubToolResult> => {
        const operation = args['arguments'];
        const fields = operation !== null && typeof operation === 'object' ? operation : {};
        sent.push({
          deviceId: 'deviceId' in fields ? fields.deviceId : null,
          body: 'body' in fields ? fields.body : null,
          profileId: caller.profileId,
        });
        if (gate !== null) await gate;
        return { response: { result: reply }, line: '', pictures: [] };
      },
    },
  });
  return {
    id,
    sent,
    answer: (result): void => {
      reply = result;
    },
    hold: (): ((result?: unknown) => void) => {
      let release: (result?: unknown) => void = () => undefined;
      gate = new Promise((resolve) => {
        release = resolve;
      });
      return (result): void => {
        if (result !== undefined) reply = result;
        release();
      };
    },
    run: (kind, params, mode): Promise<NodeResult> => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`${kind} has no handler`);
      return handler(params, request(kind, params, mode), testRun());
    },
  };
}

function bodies(rig: Rig): readonly unknown[] {
  return rig.sent.map((each) => each.body);
}

describe('every phone node is handled', () => {
  it('has a handler for each registered phone kind', async () => {
    const rig = await home();
    const kinds = NODE_REGISTRY.kinds
      .filter((kind) => kind.id.startsWith('phone.') && kind.class === 'effect')
      .map((kind) => kind.id)
      .filter((id) => id !== 'phone.action');
    for (const kind of kinds) {
      expect(await rig.run(kind, {}), kind).toMatchObject({ ok: false, class: 'Invalid' });
    }
    expect(kinds.toSorted()).toEqual([
      'phone.flashlight',
      'phone.media',
      'phone.open',
      'phone.ring',
      'phone.screen',
      'phone.sound',
      'phone.toggle',
    ]);
  });
});

describe('phone.ring', () => {
  it('rings and stops one phone', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    expect(await rig.run('phone.ring', { phone }, 'wait_for_result')).toMatchObject({ ok: true });
    await rig.run('phone.ring', { phone, on: false }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'ring', on: true },
      { type: 'ring', on: false },
    ]);
    expect(rig.sent.map((each) => each.deviceId)).toEqual([
      rig.id('Alice phone'),
      rig.id('Alice phone'),
    ]);
    expect(rig.sent[0]?.profileId).toBe(OWNER);
  });

  it('rings every phone of a person and no phone of anyone else', async () => {
    const rig = await home();
    await rig.run('phone.ring', { person: { person: ALICE } }, 'wait_for_result');
    expect(rig.sent.map((each) => each.deviceId).toSorted()).toEqual(
      [rig.id('Alice phone'), rig.id('Alice tablet')].toSorted(),
    );
  });

  it('needs exactly one of a phone and a person', async () => {
    const rig = await home();
    const both = await rig.run('phone.ring', {
      phone: { phone: rig.id('Alice phone') },
      person: { person: ALICE },
    });
    expect(both).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await rig.run('phone.ring', {})).toMatchObject({ ok: false, class: 'Invalid' });
    expect(rig.sent).toEqual([]);
  });

  it('says so when the person has no phone and when the device is not a phone', async () => {
    const rig = await home();
    expect(await rig.run('phone.ring', { person: { person: OWNER } })).toMatchObject({
      ok: false,
      class: 'NotFound',
    });
    expect(await rig.run('phone.ring', { phone: { phone: rig.id('Desk lamp') } })).toMatchObject({
      ok: false,
      class: 'Invalid',
      message: 'Desk lamp is not a phone.',
    });
    expect(
      await rig.run('phone.ring', { phone: { phone: '99999999-9999-4999-8999-999999999999' } }),
    ).toMatchObject({ ok: false, class: 'NotFound' });
    expect(rig.sent).toEqual([]);
  });
});

describe('phone.sound', () => {
  it('sends the ringer, do not disturb and volume changes it was given, all at once', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    await rig.run(
      'phone.sound',
      { phone, ringer: 'vibrate', dnd: true, stream: 'alarm', volume: 40 },
      'wait_for_result',
    );
    expect(bodies(rig)).toEqual([
      { type: 'set_ringer', mode: 'vibrate' },
      { type: 'set_dnd', on: true },
      { type: 'set_volume', stream: 'alarm', percent: 40 },
    ]);
  });

  it('sends only what was chosen and accepts do not disturb off and volume zero', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    await rig.run('phone.sound', { phone, dnd: false }, 'wait_for_result');
    await rig.run('phone.sound', { phone, stream: 'media', volume: 0 }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'set_dnd', on: false },
      { type: 'set_volume', stream: 'media', percent: 0 },
    ]);
  });

  it('refuses nothing chosen, a half volume and a volume over 100', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    expect(await rig.run('phone.sound', { phone })).toMatchObject({ ok: false, class: 'Invalid' });
    expect(await rig.run('phone.sound', { phone, stream: 'ring' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.run('phone.sound', { phone, volume: 30 })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await rig.run('phone.sound', { phone, stream: 'ring', volume: 101 })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(rig.sent).toEqual([]);
  });
});

describe('phone.media', () => {
  it('presses each media key and seeks to a position in milliseconds', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    for (const key of ['play', 'pause', 'next', 'previous'])
      await rig.run('phone.media', { phone, key }, 'wait_for_result');
    await rig.run('phone.media', { phone, key: 'seek', position: 90000 }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'media', key: 'play' },
      { type: 'media', key: 'pause' },
      { type: 'media', key: 'next' },
      { type: 'media', key: 'previous' },
      { type: 'seek', positionMs: 90000 },
    ]);
  });

  it('needs a position to seek', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    expect(await rig.run('phone.media', { phone, key: 'seek' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
  });
});

describe('phone.open', () => {
  it('opens a link named after its host unless a name is given', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    await rig.run(
      'phone.open',
      { phone, what: 'url', url: 'https://example.com/a?b=1' },
      'wait_for_result',
    );
    await rig.run(
      'phone.open',
      { phone, what: 'url', url: 'tel:+15551234', label: 'Call home' },
      'wait_for_result',
    );
    await rig.run('phone.open', { phone, what: 'url', url: 'tel:+15551234' }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'open_url', url: 'https://example.com/a?b=1', label: 'example.com' },
      { type: 'open_url', url: 'tel:+15551234', label: 'Call home' },
      { type: 'open_url', url: 'tel:+15551234', label: 'tel:+15551234' },
    ]);
  });

  it('launches an app and opens a settings page', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    await rig.run('phone.open', { phone, what: 'app', app: 'com.example.maps' }, 'wait_for_result');
    await rig.run('phone.open', { phone, what: 'settings', page: 'wifi' }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'launch_app', app: 'com.example.maps' },
      { type: 'open_settings', page: 'wifi' },
    ]);
  });

  it('refuses a missing target, an unknown settings page and a link the phone cannot open', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    for (const params of [
      { phone, what: 'url' },
      { phone, what: 'app' },
      { phone, what: 'settings' },
      { phone, what: 'settings', page: 'nowhere' },
      { phone, what: 'url', url: 'ftp://example.com/file' },
    ])
      expect(await rig.run('phone.open', params), JSON.stringify(params)).toMatchObject({
        ok: false,
        class: 'Invalid',
      });
    expect(rig.sent).toEqual([]);
  });
});

describe('phone.flashlight', () => {
  it('turns it on, off or toggles it', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    for (const mode of ['on', 'off', 'toggle'])
      await rig.run('phone.flashlight', { phone, mode }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'flashlight', mode: 'on' },
      { type: 'flashlight', mode: 'off' },
      { type: 'flashlight', mode: 'toggle' },
    ]);
  });

  it('sets the level when it is turned on with one and rejects a level of zero', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    await rig.run('phone.flashlight', { phone, mode: 'on', level: 35 }, 'wait_for_result');
    expect(bodies(rig)).toEqual([{ type: 'set_flashlight_level', percent: 35 }]);
    expect(await rig.run('phone.flashlight', { phone, mode: 'on', level: 0 })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
  });
});

describe('phone.screen', () => {
  it('locks, shows the unlock screen, and sets brightness, auto brightness and timeout', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    await rig.run('phone.screen', { phone, action: 'lock' }, 'wait_for_result');
    await rig.run('phone.screen', { phone, action: 'show_unlock' }, 'wait_for_result');
    await rig.run(
      'phone.screen',
      { phone, action: 'brightness', brightness: 0 },
      'wait_for_result',
    );
    await rig.run(
      'phone.screen',
      { phone, action: 'auto_brightness', auto: false },
      'wait_for_result',
    );
    await rig.run('phone.screen', { phone, action: 'timeout', timeout: '300' }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'lock' },
      { type: 'show_unlock' },
      { type: 'set_brightness', percent: 0 },
      { type: 'set_auto_brightness', on: false },
      { type: 'set_timeout', seconds: 300 },
    ]);
  });

  it('refuses a missing value and a timeout the phone does not offer', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    for (const params of [
      { phone, action: 'brightness' },
      { phone, action: 'auto_brightness' },
      { phone, action: 'timeout' },
      { phone, action: 'timeout', timeout: '45' },
    ])
      expect(await rig.run('phone.screen', params), JSON.stringify(params)).toMatchObject({
        ok: false,
        class: 'Invalid',
      });
    expect(rig.sent).toEqual([]);
  });
});

describe('phone.toggle', () => {
  it('turns each setting the phone can change on or off', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    await rig.run('phone.toggle', { phone, setting: 'auto_rotate' }, 'wait_for_result');
    await rig.run(
      'phone.toggle',
      { phone, setting: 'haptic_feedback', on: false },
      'wait_for_result',
    );
    await rig.run('phone.toggle', { phone, setting: 'touch_sounds', on: true }, 'wait_for_result');
    expect(bodies(rig)).toEqual([
      { type: 'set_system_toggle', setting: 'auto_rotate', on: true },
      { type: 'set_system_toggle', setting: 'haptic_feedback', on: false },
      { type: 'set_system_toggle', setting: 'touch_sounds', on: true },
    ]);
  });

  it('refuses a setting Android does not let an app change', async () => {
    const rig = await home();
    const phone = { phone: rig.id('Alice phone') };
    expect(await rig.run('phone.toggle', { phone, setting: 'wifi' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
  });
});

describe('run mode and failures', () => {
  it('sends by default and continues before the phone answers', async () => {
    const rig = await home();
    const release = rig.hold();
    const phone = { phone: rig.id('Alice phone') };
    const result = await rig.run('phone.ring', { phone });
    expect(result).toMatchObject({ ok: true });
    expect(rig.sent).toHaveLength(1);
    release();
  });

  it('waits for the phone to answer when asked to', async () => {
    const rig = await home();
    const release = rig.hold();
    const phone = { phone: rig.id('Alice phone') };
    let finished = false;
    const waiting = rig.run('phone.ring', { phone }, 'wait_for_result').then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    release();
    expect(await waiting).toMatchObject({ ok: true });
  });

  it('turns a refusal by the phone into a Refused failure with its reason', async () => {
    const rig = await home();
    rig.answer({ ok: false, detail: 'Do not disturb access is off.' });
    const phone = { phone: rig.id('Alice phone') };
    expect(await rig.run('phone.sound', { phone, dnd: true }, 'wait_for_result')).toEqual({
      ok: false,
      class: 'Refused',
      message: 'Do not disturb access is off.',
      code: 'phone_refused',
    });
  });

  it('does not fail the run when a sent command is refused later', async () => {
    const rig = await home();
    const release = rig.hold();
    const phone = { phone: rig.id('Alice phone') };
    const result = await rig.run('phone.flashlight', { phone, mode: 'on' });
    release({ ok: false, detail: 'no torch' });
    expect(result).toMatchObject({ ok: true });
  });
});
