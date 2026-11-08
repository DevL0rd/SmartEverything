import { ApiError, type ActionMode, type NodeRequest } from '@smarteverything/domain';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { describe, expect, it } from 'vitest';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import { outputs } from '../../../src/automations/engine-v3-effects';
import type { DeviceSetRequest } from '../../../src/automations/effects/device-set';
import {
  SYSTEM_FIELDS,
  computerSystemEffects,
} from '../../../src/automations/effects/computer-system-nodes';
import { ComputerOfflineError } from '../../../src/computers/computer-errors';
import { testRun } from './support';

const PC = '11111111-1111-4111-8111-111111111111';

function windowRow(id: string, app: string | null, minimised = false): unknown {
  return {
    id,
    title: id,
    app: app === null ? null : { id: app, name: app },
    desktop: null,
    minimised,
    focused: false,
  };
}

const STATES: Readonly<Record<string, unknown>> = {
  system_set: {
    battery: null,
    powerMode: null,
    dnd: null,
    keyboard: null,
    wifi: null,
    bluetooth: null,
    usb: [],
  },
  startup_set: { entries: [] },
  service_set: { services: [], timers: [] },
  close_app: { windows: 2 },
};

interface Options {
  readonly windows?: readonly unknown[];
  readonly fails?: Error;
  readonly held?: Promise<void>;
  readonly setFails?: Error;
}

function rig(options: Options = {}): {
  readonly asked: NodeRequest[];
  readonly sets: DeviceSetRequest[];
  readonly perform: (
    kind: string,
    params: Record<string, unknown>,
    mode?: ActionMode,
  ) => Promise<NodeResult>;
} {
  const asked: NodeRequest[] = [];
  const sets: DeviceSetRequest[] = [];
  const computers = new AutomationComputersSlot();
  computers.attach({
    ask: async (_viewer, _deviceId, request, schema) => {
      asked.push(request);
      if (options.fails !== undefined) throw options.fails;
      await options.held;
      const value =
        request.verb === 'windows' || request.verb === 'window_set'
          ? { windows: options.windows ?? [] }
          : (STATES[request.verb] ?? null);
      return schema.parse(value);
    },
    features: () => [],
  });
  const handlers = computerSystemEffects({
    computers,
    setter: {
      set: (request) => {
        sets.push(request);
        if (options.setFails !== undefined) return Promise.reject(options.setFails);
        return Promise.resolve({ sent: [PC], skipped: [], note: null });
      },
    },
  });
  return {
    asked,
    sets,
    perform: async (kind, params, mode): Promise<NodeResult> => {
      const handler = handlers[kind];
      if (handler === undefined) throw new Error(`no handler for ${kind}`);
      const ports = outputs(params);
      return handler(
        ports,
        {
          kind,
          node: { id: 'n1', key: 'n1' },
          path: 'n1',
          activation: '0',
          key: 'n1',
          params: ports,
          retry: 'external',
          budget: 'effects',
          ...(mode === undefined ? {} : { mode }),
        },
        testRun(),
      );
    },
  };
}

const SYSTEM_CASES: readonly (readonly [string, Record<string, unknown>, NodeRequest])[] = [
  [
    'power_mode',
    { mode: 'performance' },
    { verb: 'system_set', change: { action: 'power_mode', mode: 'performance' } },
  ],
  ['dnd', { enabled: true }, { verb: 'system_set', change: { action: 'dnd', enabled: true } }],
  [
    'keyboard_layout',
    { layout: 'us' },
    { verb: 'system_set', change: { action: 'keyboard_layout', layout: 'us' } },
  ],
  ['wifi', { enabled: false }, { verb: 'system_set', change: { action: 'wifi', enabled: false } }],
  [
    'wifi_connect',
    { network: 'Home' },
    { verb: 'system_set', change: { action: 'wifi_connect', network: 'Home' } },
  ],
  [
    'bluetooth',
    { enabled: true },
    { verb: 'system_set', change: { action: 'bluetooth', enabled: true } },
  ],
  [
    'bluetooth_device',
    { device: 'AA:BB', connected: false },
    {
      verb: 'system_set',
      change: { action: 'bluetooth_device', device: 'AA:BB', connected: false },
    },
  ],
  [
    'startup_app',
    { startupApp: 'steam', enabled: false },
    { verb: 'startup_set', change: { action: 'startup_app', id: 'steam', enabled: false } },
  ],
  [
    'service',
    { unit: 'sshd.service', operation: 'restart' },
    {
      verb: 'service_set',
      change: { action: 'service', unit: 'sshd.service', operation: 'restart' },
    },
  ],
];

describe('computer.system', () => {
  it.each(SYSTEM_CASES)(
    'sends the %s setting from the typed ports',
    async (setting, ports, sent) => {
      const { perform, asked } = rig();
      const result = await perform('computer.system', { computer: PC, setting, ...ports });
      expect(result).toMatchObject({ ok: true, value: { ok: true } });
      expect(asked).toEqual([sent]);
    },
  );

  it('covers every setting of the tool', () => {
    expect(Object.keys(SYSTEM_FIELDS)).toEqual(SYSTEM_CASES.map(([setting]) => setting));
  });

  it('takes the computer as a reference too', async () => {
    const { perform, asked } = rig();
    await perform('computer.system', {
      computer: { computer: PC },
      setting: 'dnd',
      enabled: false,
    });
    expect(asked).toEqual([{ verb: 'system_set', change: { action: 'dnd', enabled: false } }]);
  });

  it('names what is missing in plain words and asks nothing', async () => {
    const { perform, asked } = rig();
    const result = await perform('computer.system', {
      computer: PC,
      setting: 'bluetooth_device',
      device: 'AA:BB',
    });
    expect(result).toMatchObject({ ok: false, class: 'Invalid' });
    expect(result.ok ? '' : result.message).toContain('connected or not');
    expect(await perform('computer.system', { computer: PC, setting: 'sleep' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(asked).toEqual([]);
  });

  it('refuses a power mode the computer does not know', async () => {
    const { perform, asked } = rig();
    expect(
      await perform('computer.system', { computer: PC, setting: 'power_mode', mode: 'turbo' }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
    expect(asked).toEqual([]);
  });

  it('continues as soon as it was asked when sending and when the computer answers when waiting', async () => {
    let answer: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const { perform } = rig({ held });
    const ports = { computer: PC, setting: 'dnd', enabled: true };
    expect(await perform('computer.system', ports, 'fire_and_forget')).toMatchObject({ ok: true });
    let finished = false;
    const waiting = perform('computer.system', ports, 'wait_for_result').then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    answer();
    expect(await waiting).toMatchObject({ ok: true });
  });

  it('gives an offline computer the reason Unreachable when waiting', async () => {
    const { perform } = rig({ fails: new ComputerOfflineError() });
    expect(
      await perform(
        'computer.system',
        { computer: PC, setting: 'dnd', enabled: true },
        'wait_for_result',
      ),
    ).toEqual({
      ok: false,
      class: 'Unreachable',
      message: 'ComputerOfflineError: This computer is offline.',
      code: 'offline',
    });
  });
});

describe('computer.app', () => {
  it('opens an app', async () => {
    const { perform, asked } = rig();
    expect(
      await perform('computer.app', { computer: PC, action: 'open', app: 'firefox.desktop' }),
    ).toMatchObject({ ok: true });
    expect(asked).toEqual([{ verb: 'open_app', appId: 'firefox.desktop' }]);
  });

  it('closes an app, forcing only when asked to', async () => {
    const { perform, asked } = rig();
    await perform('computer.app', { computer: PC, action: 'close', app: 'a' });
    await perform('computer.app', { computer: PC, action: 'close', app: 'a', force: true });
    expect(asked).toEqual([
      { verb: 'close_app', appId: 'a', force: false },
      { verb: 'close_app', appId: 'a', force: true },
    ]);
  });

  it('brings the first window of the app to the front', async () => {
    const { perform, asked } = rig({
      windows: [windowRow('w1', 'other'), windowRow('w2', 'a'), windowRow('w3', 'a')],
    });
    expect(
      await perform('computer.app', { computer: PC, action: 'focus', app: 'a' }, 'wait_for_result'),
    ).toMatchObject({ ok: true });
    expect(asked).toEqual([
      { verb: 'windows' },
      { verb: 'window_set', change: { windowId: 'w2', action: 'focus' } },
    ]);
  });

  it('minimises every window of the app and no others', async () => {
    const { perform, asked } = rig({
      windows: [windowRow('w1', 'other'), windowRow('w2', 'a'), windowRow('w3', 'a')],
    });
    await perform(
      'computer.app',
      { computer: PC, action: 'minimise', app: 'a' },
      'wait_for_result',
    );
    expect(asked).toEqual([
      { verb: 'windows' },
      { verb: 'window_set', change: { windowId: 'w2', action: 'minimise' } },
      { verb: 'window_set', change: { windowId: 'w3', action: 'minimise' } },
    ]);
  });

  it('says NotFound when the app has no window to bring forward', async () => {
    const { perform, asked } = rig({ windows: [windowRow('w1', null), windowRow('w2', 'other')] });
    expect(
      await perform('computer.app', { computer: PC, action: 'focus', app: 'a' }, 'wait_for_result'),
    ).toMatchObject({ ok: false, class: 'NotFound' });
    expect(asked).toEqual([{ verb: 'windows' }]);
  });

  it('refuses an action it does not know', async () => {
    const { perform, asked } = rig();
    expect(
      await perform('computer.app', { computer: PC, action: 'minimize', app: 'a' }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
    expect(asked).toEqual([]);
  });
});

describe('computer.open', () => {
  it('opens a link', async () => {
    const { perform, asked } = rig();
    expect(
      await perform('computer.open', { computer: PC, url: 'https://example.com/a' }),
    ).toMatchObject({ ok: true });
    expect(asked).toEqual([
      { verb: 'open', target: { kind: 'url', url: 'https://example.com/a' } },
    ]);
  });

  it('opens a file or folder by its full path', async () => {
    const { perform, asked } = rig();
    await perform('computer.open', { computer: PC, path: '/home/user/notes.txt' });
    expect(asked).toEqual([
      { verb: 'open', target: { kind: 'path', path: '/home/user/notes.txt' } },
    ]);
  });

  it('wants a link or a path and nothing the computer cannot open', async () => {
    const { perform, asked } = rig();
    for (const ports of [
      {},
      { url: 'https://example.com', path: '/tmp/a' },
      { url: 'ftp://example.com/file' },
      { path: 'relative/file.txt' },
    ]) {
      expect(await perform('computer.open', { computer: PC, ...ports })).toMatchObject({
        ok: false,
        class: 'Invalid',
      });
    }
    expect(asked).toEqual([]);
  });
});

describe('computer.power', () => {
  it('asks the computer to do a power action', async () => {
    const { perform, asked, sets } = rig();
    expect(await perform('computer.power', { computer: PC, action: 'lock_screen' })).toMatchObject({
      ok: true,
    });
    expect(asked).toEqual([{ verb: 'power', action: 'lock_screen' }]);
    expect(sets).toEqual([]);
  });

  it('wakes a computer through its wake command and never asks the sleeping computer', async () => {
    const { perform, asked, sets } = rig();
    expect(
      await perform('computer.power', { computer: PC, action: 'wake' }, 'wait_for_result'),
    ).toMatchObject({ ok: true });
    expect(asked).toEqual([]);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({
      target: { kind: 'devices', deviceIds: [PC] },
      control: 'wake',
      mode: 'wait_for_result',
    });
    expect(sets[0]?.value()).toBeNull();
  });

  it('gives a computer that cannot be woken the reason Refused', async () => {
    const { perform } = rig({
      setFails: new ApiError('command_refused', 'No supported target commands.'),
    });
    expect(await perform('computer.power', { computer: PC, action: 'wake' })).toMatchObject({
      ok: false,
      class: 'Refused',
    });
  });

  it('still refuses an action that is not a power action', async () => {
    const { perform, asked } = rig();
    expect(await perform('computer.power', { computer: PC, action: 'explode' })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(asked).toEqual([]);
  });
});
