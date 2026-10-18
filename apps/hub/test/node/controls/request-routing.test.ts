import {
  DEFAULT_COMPUTER_SCOPES,
  type AudioState,
  type DisplayState,
  type NodeHello,
  type WindowsState,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { controlFeatures, type ComputerControls } from '../../../src/node/controls/controls';
import { NodeRequestHandler, type HandledRequest } from '../../../src/node/request-handler';
import { captureLogs, testLogger } from '../../support/logs';
import { unusedControls } from './unused-controls';

const HELLO: NodeHello = {
  machineId: '0123456789abcdef0123456789abcdef',
  hostname: 'desk',
  os: { name: 'Linux', kernel: '6.0' },
  hardware: { vendor: null, product: null, portable: false },
  cpu: { model: 'CPU', threads: 2, hybrid: false, kinds: [] },
  memoryBytes: 8e9,
  interfaces: [],
  bootedAt: '2026-10-08T09:00:00.000Z',
  power: [],
  actions: [],
  permissions: [],
  features: [],
  role: 'pc',
};

const AUDIO: AudioState = { outputs: [], inputs: [], apps: [] };
const DISPLAYS: DisplayState = {
  outputs: [],
  nightLight: { supported: false, mode: 'off', active: false, temperatureKelvin: null },
  pendingRevert: null,
};
const WINDOWS: WindowsState = { windows: [] };

function baseControls(): ComputerControls {
  const unused = unusedControls();
  return {
    ...unused,
    power: { available: () => Promise.resolve([]), run: () => Promise.resolve() },
    processes: {
      list: () => Promise.reject(new Error('unused')),
      signal: () => undefined,
      watch: () => undefined,
      read: () => null,
      stop: () => undefined,
    },
    links: () => [],
    session: {
      start: () => Promise.resolve(),
      stop: () => Promise.resolve(),
      setVolume: () => Promise.resolve(),
      setMuted: () => Promise.resolve(),
      playback: () => Promise.resolve(),
    },
    apps: {
      installed: () => Promise.resolve([]),
      open: () => Promise.resolve(),
      close: () => Promise.resolve(0),
    },
    files: {
      list: () => Promise.reject(new Error('unused')),
      read: () => Promise.reject(new Error('unused')),
      range: () => Promise.reject(new Error('unused')),
    },
    capture: { capture: () => Promise.reject(new Error('unused')) },
  };
}

function handler(seen: string[]): NodeRequestHandler {
  const base = baseControls();
  const unused = base;
  const controls: ComputerControls = {
    ...base,
    audio: {
      ...unused.audio,
      read: () => Promise.resolve(AUDIO),
      change: (change) => {
        seen.push(`audio ${change.action}`);
        return Promise.resolve(AUDIO);
      },
    },
    displays: {
      ...unused.displays,
      read: () => Promise.resolve(DISPLAYS),
      change: (change, revert) => {
        seen.push(`display ${change.action} revert=${String(revert)}`);
        return Promise.resolve(DISPLAYS);
      },
      confirm: (token, keep) => {
        seen.push(`confirm ${token} keep=${String(keep)}`);
        return Promise.resolve(DISPLAYS);
      },
    },
    windows: {
      ...unused.windows,
      read: () => Promise.resolve(WINDOWS),
      change: (change) => {
        seen.push(`window ${change.action} ${change.windowId}`);
        return Promise.resolve(WINDOWS);
      },
    },
    system: {
      ...unused.system,
      settings: {
        state: () => Promise.reject(new Error('system state reached')),
        apply: unused.system.settings.apply,
      },
    },
  };
  return new NodeRequestHandler(controls);
}

describe('request routing for audio, displays and windows', () => {
  it('sends each verb to its control with the request fields', async () => {
    const seen: string[] = [];
    const node = handler(seen);
    const requests: HandledRequest[] = [
      { verb: 'audio' },
      { verb: 'audio_set', change: { action: 'mute', muted: true, kind: 'input' } },
      { verb: 'displays' },
      { verb: 'display_set', change: { action: 'disable', output: 'DP-3' }, revert: true },
      { verb: 'display_confirm', token: 't', keep: false },
      { verb: 'windows' },
      { verb: 'window_set', change: { windowId: 'w1', action: 'close' } },
    ];
    for (const request of requests) {
      await node.handle(request, HELLO);
    }
    expect(seen).toEqual([
      'audio mute',
      'display disable revert=true',
      'confirm t keep=false',
      'window close w1',
    ]);
  });

  it('answers the state the control returns', async () => {
    await expect(handler([]).handle({ verb: 'audio' }, HELLO)).resolves.toEqual(AUDIO);
    await expect(handler([]).handle({ verb: 'windows' }, HELLO)).resolves.toEqual(WINDOWS);
  });

  it('refuses audio and displays when the system scope is off and windows when apps is off', async () => {
    const node = handler([]);
    node.allow({ ...DEFAULT_COMPUTER_SCOPES, system: false });
    await expect(node.handle({ verb: 'audio' }, HELLO)).rejects.toMatchObject({
      code: 'scope_off',
    });
    await expect(
      node.handle({ verb: 'display_set', change: { action: 'identify' }, revert: false }, HELLO),
    ).rejects.toMatchObject({ code: 'scope_off' });
    await expect(node.handle({ verb: 'windows' }, HELLO)).resolves.toEqual(WINDOWS);
    node.allow({ ...DEFAULT_COMPUTER_SCOPES, apps: false });
    await expect(node.handle({ verb: 'windows' }, HELLO)).rejects.toMatchObject({
      code: 'scope_off',
    });
  });

  it('hands the system verbs to the system controls', async () => {
    await expect(handler([]).handle({ verb: 'system' }, HELLO)).rejects.toThrow(
      'system state reached',
    );
  });
});

describe('features from the controls', () => {
  it('joins what each control offers and survives one that fails', async () => {
    const unused = baseControls();
    const logs = captureLogs();
    const controls: ComputerControls = {
      ...unused,
      audio: { ...unused.audio, features: () => Promise.resolve(['audio']) },
      displays: { ...unused.displays, features: () => Promise.reject(new Error('kscreen died')) },
      windows: { ...unused.windows, features: () => Promise.resolve(['windows']) },
      system: { ...unused.system, features: () => Promise.resolve(['dnd']) },
    };
    await expect(controlFeatures(controls, testLogger('node'))).resolves.toEqual([
      'audio',
      'windows',
      'dnd',
    ]);
    expect(logs.events()).toEqual(['node.features_failed']);
  });
});
