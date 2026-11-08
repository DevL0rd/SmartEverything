import {
  DISPLAY_STATE,
  NODE_REGISTRY,
  type DisplayState,
  type NodeRequest,
} from '@smarteverything/domain';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { describe, expect, it } from 'vitest';
import { outputs } from '../../../src/automations/engine-v3-effects';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import {
  AUDIO_FIELDS,
  DISPLAY_FIELDS,
  computerNodeEffects,
} from '../../../src/automations/effects/computer-nodes';
import { ComputerOfflineError } from '../../../src/computers/computer-errors';
import { testRun } from './support';

const PC = '11111111-1111-4111-8111-111111111111';

function screen(id: string): DisplayState['outputs'][number] {
  return {
    id,
    name: `Screen ${id}`,
    builtIn: false,
    enabled: true,
    primary: id === 'DP-1',
    mode: { width: 2560, height: 1440, refreshHz: 144, preferred: true },
    modes: [{ width: 2560, height: 1440, refreshHz: 144, preferred: true }],
    scalePercent: 100,
    rotation: 0,
    x: 0,
    y: 0,
    brightness: null,
    hdr: { supported: true, enabled: false },
    vrr: null,
    mirrorOf: null,
  };
}

function displayState(screens: readonly string[], pending: boolean): DisplayState {
  return DISPLAY_STATE.parse({
    outputs: screens.map(screen),
    nightLight: { supported: true, mode: 'off', active: false, temperatureKelvin: null },
    pendingRevert: pending
      ? {
          token: 'token-1',
          startedAt: '2026-10-25T10:00:00.000Z',
          revertsAt: '2026-10-25T10:00:15.000Z',
          summary: 'Resolution changed',
        }
      : null,
  });
}

interface Options {
  readonly screens?: readonly string[];
  readonly pending?: boolean;
  readonly fails?: Error;
}

function rig(options: Options = {}): {
  readonly asked: NodeRequest[];
  readonly perform: (kind: string, params: Record<string, unknown>) => Promise<NodeResult>;
} {
  const asked: NodeRequest[] = [];
  const computers = new AutomationComputersSlot();
  computers.attach({
    ask: (_viewer, _deviceId, request, schema) => {
      asked.push(request);
      if (options.fails !== undefined) return Promise.reject(options.fails);
      const state = displayState(options.screens ?? ['DP-1'], options.pending ?? false);
      return Promise.resolve(
        schema.parse(request.verb === 'audio_set' ? { outputs: [], inputs: [], apps: [] } : state),
      );
    },
    features: () => [],
  });
  const handlers = computerNodeEffects({
    computers,
    setter: {
      set: (): never => {
        throw new Error('not used by this test');
      },
    },
  });
  return {
    asked,
    perform: async (kind, params): Promise<NodeResult> => {
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
          retry: 'idempotent',
          budget: 'effects',
        },
        testRun(),
      );
    },
  };
}

const AUDIO_CASES: readonly (readonly [
  string,
  Record<string, unknown>,
  Record<string, unknown>,
])[] = [
  ['volume', { level: 40 }, { action: 'volume', level: 40, kind: 'output' }],
  [
    'volume',
    { level: 25, kind: 'input', device: 'mic-1' },
    { action: 'volume', level: 25, kind: 'input', device: 'mic-1' },
  ],
  ['mute', { muted: true }, { action: 'mute', muted: true, kind: 'output' }],
  [
    'default',
    { kind: 'output', device: 'sink-2' },
    { action: 'default', kind: 'output', device: 'sink-2' },
  ],
  [
    'app_volume',
    { app: 'firefox', level: 60 },
    { action: 'app_volume', app: 'firefox', level: 60 },
  ],
  [
    'app_mute',
    { app: 'firefox', muted: false },
    { action: 'app_mute', app: 'firefox', muted: false },
  ],
  [
    'app_output',
    { app: 'firefox', output: 'sink-2' },
    { action: 'app_output', app: 'firefox', output: 'sink-2' },
  ],
];

describe('computer.audio', () => {
  it.each(AUDIO_CASES)(
    'sends the %s action from the typed ports',
    async (action, ports, change) => {
      const { perform, asked } = rig();
      const result = await perform('computer.audio', { computer: PC, action, ...ports });
      expect(result).toMatchObject({ ok: true, value: { ok: true } });
      expect(asked).toEqual([{ verb: 'audio_set', change }]);
    },
  );

  it('covers every action of the audio tool', () => {
    expect(Object.keys(AUDIO_FIELDS)).toEqual([
      'volume',
      'mute',
      'default',
      'app_volume',
      'app_mute',
      'app_output',
    ]);
  });

  it('refuses a missing field and no action', async () => {
    const { perform, asked } = rig();
    expect(
      await perform('computer.audio', { computer: PC, action: 'app_mute', app: 'x' }),
    ).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(await perform('computer.audio', { computer: PC })).toMatchObject({
      ok: false,
      class: 'Invalid',
    });
    expect(asked).toEqual([]);
  });

  it('gives an offline computer the reason Unreachable', async () => {
    const { perform } = rig({ fails: new ComputerOfflineError() });
    expect(
      await perform('computer.audio', { computer: PC, action: 'mute', muted: true }),
    ).toMatchObject({ ok: false, class: 'Unreachable', code: 'offline' });
  });
});

const DISPLAY_CASES: readonly (readonly [
  string,
  Record<string, unknown>,
  Record<string, unknown>,
])[] = [
  ['enable', { output: 'DP-2' }, { action: 'enable', output: 'DP-2' }],
  ['disable', { output: 'DP-2' }, { action: 'disable', output: 'DP-2' }],
  [
    'mode',
    { output: 'DP-1', width: 1920, height: 1080, refreshHz: 60 },
    { action: 'mode', output: 'DP-1', width: 1920, height: 1080, refreshHz: 60 },
  ],
  ['scale', { output: 'DP-1', scale: 150 }, { action: 'scale', output: 'DP-1', percent: 150 }],
  [
    'rotation',
    { output: 'DP-1', rotation: '90' },
    { action: 'rotation', output: 'DP-1', degrees: 90 },
  ],
  ['primary', { output: 'DP-2' }, { action: 'primary', output: 'DP-2' }],
  [
    'position',
    { output: 'DP-2', relativeTo: 'DP-1', side: 'left' },
    { action: 'position', output: 'DP-2', relativeTo: 'DP-1', side: 'left' },
  ],
  [
    'mirror',
    { output: 'DP-2', mirrorOf: 'DP-1' },
    { action: 'mirror', output: 'DP-2', of: 'DP-1' },
  ],
  ['mirror', { output: 'DP-2' }, { action: 'mirror', output: 'DP-2', of: null }],
  ['brightness', { brightness: 35 }, { action: 'brightness', level: 35 }],
  ['hdr', { output: 'DP-1', enabled: true }, { action: 'hdr', output: 'DP-1', enabled: true }],
  [
    'vrr',
    { output: 'DP-1', vrr: 'automatic' },
    { action: 'vrr', output: 'DP-1', policy: 'automatic' },
  ],
  [
    'night_light',
    { nightLight: 'on', temperature: 3500 },
    { action: 'night_light', mode: 'on', temperatureKelvin: 3500 },
  ],
];

describe('computer.display', () => {
  it.each(DISPLAY_CASES)(
    'sends the %s action from the typed ports',
    async (action, ports, change) => {
      const { perform, asked } = rig({ screens: ['DP-1', 'DP-2'] });
      const result = await perform('computer.display', { computer: PC, action, ...ports });
      expect(result).toMatchObject({ ok: true, value: { ok: true } });
      expect(asked[0]).toMatchObject({ verb: 'display_set', change });
    },
  );

  it('asks the computer to revert only the changes that can lock someone out', async () => {
    const { perform, asked } = rig({ screens: ['DP-1', 'DP-2'] });
    await perform('computer.display', { computer: PC, action: 'disable', output: 'DP-2' });
    await perform('computer.display', {
      computer: PC,
      action: 'hdr',
      output: 'DP-1',
      enabled: true,
    });
    expect(asked.map((request) => request.verb === 'display_set' && request.revert)).toEqual([
      true,
      false,
    ]);
  });

  it('uses the only screen when none is chosen and asks to choose when there are several', async () => {
    const single = rig({ screens: ['DP-1'] });
    await single.perform('computer.display', { computer: PC, action: 'primary' });
    expect(single.asked.map((request) => request.verb)).toEqual(['displays', 'display_set']);
    expect(single.asked[1]).toMatchObject({ change: { action: 'primary', output: 'DP-1' } });
    const several = rig({ screens: ['DP-1', 'DP-2'] });
    const refused = await several.perform('computer.display', { computer: PC, action: 'primary' });
    expect(refused).toMatchObject({ ok: false, class: 'Invalid' });
    expect(refused.ok ? '' : refused.message).toContain('Screen DP-2 (DP-2)');
    expect(several.asked.map((request) => request.verb)).toEqual(['displays']);
  });

  it('keeps or undoes the change that is waiting, with its token', async () => {
    const kept = rig({ pending: true });
    expect(await kept.perform('computer.display', { computer: PC, action: 'keep' })).toMatchObject({
      ok: true,
    });
    expect(kept.asked).toEqual([
      { verb: 'displays' },
      { verb: 'display_confirm', token: 'token-1', keep: true },
    ]);
    const undone = rig({ pending: true });
    await undone.perform('computer.display', { computer: PC, action: 'revert' });
    expect(undone.asked[1]).toEqual({ verb: 'display_confirm', token: 'token-1', keep: false });
  });

  it('fails when no change is waiting to be kept', async () => {
    const { perform, asked } = rig({ pending: false });
    const result = await perform('computer.display', { computer: PC, action: 'keep' });
    expect(result).toMatchObject({ ok: false, class: 'Failed' });
    expect(result.ok ? '' : result.message).toContain('No screen change is waiting to be kept.');
    expect(asked).toEqual([{ verb: 'displays' }]);
  });

  it('keeps a changed screen when the node says keep', async () => {
    const { perform, asked } = rig({ screens: ['DP-1'], pending: true });
    await perform('computer.display', {
      computer: PC,
      action: 'mode',
      output: 'DP-1',
      width: 2560,
      height: 1440,
      keep: true,
    });
    expect(asked.map((request) => request.verb)).toEqual(['display_set', 'display_confirm']);
  });

  it('refuses a missing field and reports an offline computer as Unreachable', async () => {
    const { perform } = rig();
    expect(
      await perform('computer.display', { computer: PC, action: 'scale', output: 'DP-1' }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
    const offline = rig({ fails: new ComputerOfflineError() });
    expect(
      await offline.perform('computer.display', {
        computer: PC,
        action: 'brightness',
        brightness: 5,
      }),
    ).toMatchObject({ ok: false, class: 'Unreachable', code: 'offline' });
  });
});

describe('typed ports and the hub agree', () => {
  const ADVICE: Record<string, Record<string, readonly (readonly [string, string])[]>> = {
    'computer.audio': AUDIO_FIELDS,
    'computer.display': DISPLAY_FIELDS,
  };

  it.each(Object.keys(ADVICE))('%s reads every typed port the node declares', (id) => {
    const used = new Set(
      Object.values(ADVICE[id] ?? {}).flatMap((pairs) => pairs.map(([, port]) => port)),
    );
    const declared = (NODE_REGISTRY.get(id)?.inputs ?? [])
      .map((port) => port.name)
      .filter((name) => !['computer', 'action', 'keep'].includes(name));
    expect([...used].sort()).toEqual([...declared].sort());
  });

  it.each(Object.keys(ADVICE))('%s offers exactly the actions the hub can run', (id) => {
    const choice = NODE_REGISTRY.get(id)?.inputs.find((port) => port.name === 'action')?.type;
    const offered = choice?.t === 'choice' ? choice.options.map((option) => option.id) : [];
    expect(offered).toEqual(Object.keys(ADVICE[id] ?? {}));
  });
});
