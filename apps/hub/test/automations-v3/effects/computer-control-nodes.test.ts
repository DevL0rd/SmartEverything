import { type ActionMode, type NodeRequest } from '@smarteverything/domain';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { describe, expect, it } from 'vitest';
import { AutomationComputersSlot } from '../../../src/automations/automation-computers';
import { outputs } from '../../../src/automations/engine-v3-effects';
import { computerControlEffects } from '../../../src/automations/effects/computer-control-nodes';
import { computerNodeEffects } from '../../../src/automations/effects/computer-nodes';
import {
  ComputerOfflineError,
  ComputerScopeOffError,
} from '../../../src/computers/computer-errors';
import { testRun } from './support';

const PC = '11111111-1111-4111-8111-111111111111';

function windowRow(
  id: string,
  app: string | null,
  focused = false,
  minimised = false,
): Record<string, unknown> {
  return {
    id,
    title: id,
    app: app === null ? null : { id: app, name: app },
    desktop: null,
    minimised,
    focused,
  };
}

interface Options {
  readonly windows?: readonly unknown[];
  readonly fails?: Error;
  readonly failsFor?: ReadonlySet<number>;
  readonly held?: Promise<void>;
}

function rig(options: Options = {}): {
  readonly asked: NodeRequest[];
  readonly perform: (
    kind: string,
    params: Record<string, unknown>,
    mode?: ActionMode,
  ) => Promise<NodeResult>;
} {
  const asked: NodeRequest[] = [];
  const computers = new AutomationComputersSlot();
  computers.attach({
    ask: async (_viewer, _deviceId, request, schema) => {
      asked.push(request);
      if (options.fails !== undefined) throw options.fails;
      if (
        (request.verb === 'signal' || request.verb === 'priority') &&
        options.failsFor?.has(request.pid) === true
      ) {
        throw new ComputerOfflineError();
      }
      await options.held;
      if (request.verb === 'windows') return schema.parse({ windows: options.windows ?? [] });
      return schema.parse(request.verb === 'priority' ? { pid: request.pid } : null);
    },
    features: () => [],
  });
  const handlers = computerControlEffects({ computers });
  return {
    asked,
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

describe('computer.keys', () => {
  it('presses a key combination', async () => {
    const { perform, asked } = rig();
    expect(await perform('computer.keys', { computer: PC, keys: 'ctrl+shift+t' })).toMatchObject({
      ok: true,
    });
    expect(asked).toEqual([{ verb: 'input', input: { action: 'keys', keys: 'ctrl+shift+t' } }]);
  });

  it('types a text', async () => {
    const { perform, asked } = rig();
    await perform('computer.keys', { computer: PC, text: 'hello world' });
    expect(asked).toEqual([{ verb: 'input', input: { action: 'type', text: 'hello world' } }]);
  });

  it('never sends a pointer action', async () => {
    const { perform, asked } = rig();
    await perform('computer.keys', { computer: PC, keys: 'Return' });
    await perform('computer.keys', { computer: PC, text: 'a' });
    for (const request of asked) {
      expect(request.verb === 'input' ? request.input.action : '').toMatch(/^(keys|type)$/);
    }
  });

  it('wants keys or a text, not both and not neither, and a real key combination', async () => {
    const { perform, asked } = rig();
    for (const ports of [{}, { keys: 'ctrl+l', text: 'a' }, { keys: 'ctrl+nonsense+' }]) {
      expect(await perform('computer.keys', { computer: PC, ...ports })).toMatchObject({
        ok: false,
        class: 'Invalid',
      });
    }
    expect(asked).toEqual([]);
  });

  it('continues as soon as it was asked when sending and when the computer answers when waiting', async () => {
    let answer: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const { perform } = rig({ held });
    const ports = { computer: PC, keys: 'F5' };
    expect(await perform('computer.keys', ports)).toMatchObject({ ok: true });
    let finished = false;
    const waiting = perform('computer.keys', ports, 'wait_for_result').then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    answer();
    expect(await waiting).toMatchObject({ ok: true });
  });

  it('gives a computer with keyboard control off the reason Forbidden when waiting', async () => {
    const { perform } = rig({ fails: new ComputerScopeOffError('input') });
    expect(
      await perform('computer.keys', { computer: PC, keys: 'F5' }, 'wait_for_result'),
    ).toMatchObject({ ok: false, class: 'Forbidden' });
  });
});

describe('computer.process', () => {
  it.each([
    ['end', 'end'],
    ['force', 'force'],
    ['stop', 'stop'],
    ['continue', 'continue'],
  ] as const)('%s sends the %s signal to each program and counts them', async (action, signal) => {
    const { perform, asked } = rig();
    const result = await perform('computer.process', {
      computer: PC,
      action,
      process: ['4242', '77'],
    });
    expect(result).toEqual({ ok: true, value: outputs({ ended: 2 }) });
    expect(asked).toEqual([
      { verb: 'signal', pid: 4242, signal },
      { verb: 'signal', pid: 77, signal },
    ]);
  });

  it('sets the priority as the nice value of normal, low or lowest', async () => {
    const { perform, asked } = rig();
    for (const priority of ['normal', 'low', 'lowest']) {
      await perform('computer.process', {
        computer: PC,
        action: 'priority',
        process: ['9'],
        priority,
      });
    }
    expect(asked).toEqual([
      { verb: 'priority', pid: 9, nice: 0 },
      { verb: 'priority', pid: 9, nice: 10 },
      { verb: 'priority', pid: 9, nice: 19 },
    ]);
  });

  it('names the missing priority and asks nothing', async () => {
    const { perform, asked } = rig();
    expect(
      await perform('computer.process', { computer: PC, action: 'priority', process: ['9'] }),
    ).toMatchObject({ ok: false, class: 'Invalid' });
    expect(asked).toEqual([]);
  });

  it('signals a program once however often it is picked', async () => {
    const { perform, asked } = rig();
    const result = await perform('computer.process', {
      computer: PC,
      action: 'end',
      process: ['5', '5', 5],
    });
    expect(result).toEqual({ ok: true, value: outputs({ ended: 1 }) });
    expect(asked).toHaveLength(1);
  });

  it('counts only the programs it reached when some are gone', async () => {
    const { perform } = rig({ failsFor: new Set([2]) });
    expect(
      await perform('computer.process', {
        computer: PC,
        action: 'force',
        process: ['1', '2', '3'],
      }),
    ).toEqual({ ok: true, value: outputs({ ended: 2 }) });
  });

  it('fails with the reason when it reached none', async () => {
    const { perform } = rig({ fails: new ComputerOfflineError() });
    expect(
      await perform('computer.process', { computer: PC, action: 'end', process: ['1', '2'] }),
    ).toMatchObject({ ok: false, class: 'Unreachable', code: 'offline' });
  });

  it('refuses no programs, a bad process number and an unknown action', async () => {
    const { perform, asked } = rig();
    for (const ports of [
      { action: 'end', process: [] },
      { action: 'end', process: ['abc'] },
      { action: 'end', process: ['0'] },
      { action: 'kill', process: ['1'] },
    ]) {
      expect(await perform('computer.process', { computer: PC, ...ports })).toMatchObject({
        ok: false,
        class: 'Invalid',
      });
    }
    expect(asked).toEqual([]);
  });

  it('waits for the computer even when no mode is chosen', async () => {
    let answer: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const { perform } = rig({ held });
    let finished = false;
    const waiting = perform('computer.process', {
      computer: PC,
      action: 'end',
      process: ['1'],
    }).then((result) => {
      finished = true;
      return result;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    answer();
    expect(await waiting).toEqual({ ok: true, value: outputs({ ended: 1 }) });
  });
});

describe('computer.windows', () => {
  it('lists each app with a window once and the app in front', async () => {
    const { perform, asked } = rig({
      windows: [
        windowRow('w1', 'Firefox'),
        windowRow('w2', 'Steam', true),
        windowRow('w3', 'Firefox', false, true),
        windowRow('w4', null),
      ],
    });
    expect(await perform('computer.windows', { computer: PC })).toEqual({
      ok: true,
      value: outputs({ apps: ['Firefox', 'Steam'], focused: 'Steam' }),
    });
    expect(asked).toEqual([{ verb: 'windows' }]);
  });

  it('leaves the focused app out when none is in front', async () => {
    const { perform } = rig({ windows: [windowRow('w1', 'Firefox')] });
    expect(await perform('computer.windows', { computer: PC })).toEqual({
      ok: true,
      value: outputs({ apps: ['Firefox'] }),
    });
  });

  it('gives an empty list when no window is open', async () => {
    const { perform } = rig();
    expect(await perform('computer.windows', { computer: PC })).toEqual({
      ok: true,
      value: outputs({ apps: [] }),
    });
  });

  it('gives an offline computer the reason Unreachable', async () => {
    const { perform } = rig({ fails: new ComputerOfflineError() });
    expect(await perform('computer.windows', { computer: PC })).toMatchObject({
      ok: false,
      class: 'Unreachable',
    });
  });
});

describe('computer node registration', () => {
  it('registers the control handlers next to the sound, screen, settings and app ones', () => {
    const computers = new AutomationComputersSlot();
    const handlers = computerNodeEffects({
      computers,
      setter: { set: () => Promise.resolve({ sent: [], skipped: [], note: null }) },
    });
    for (const id of [
      'computer.audio',
      'computer.display',
      'computer.power',
      'computer.system',
      'computer.app',
      'computer.open',
      'computer.keys',
      'computer.process',
      'computer.windows',
    ]) {
      expect(handlers[id]).toBeTypeOf('function');
    }
  });
});
