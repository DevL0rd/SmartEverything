import type { CommandRow, JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeSetups, setup } from './support/executor-setup';
import { captureLogs } from './support/logs';

afterEach(closeSetups);

beforeEach(() => {
  captureLogs();
});

describe('CommandExecutor on one control', () => {
  const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  it('runs only the newest of the commands queued behind a running one and marks the others superseded', async () => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    const rows = [10, 20, 30, 40].map((value) =>
      commands.add({ device_id: lampId, capability: 'brightness', value }),
    );
    const runs: Promise<void>[] = [];
    for (const row of rows) {
      runs.push(executor.run(row));
      await tick();
    }
    adapter.release();
    await tick();
    adapter.release();
    await Promise.all(runs);
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([10, 40]);
    const ids = rows.map((row) => row.id);
    expect(rows.map((row) => commands.get(row.id).status)).toStrictEqual([
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    expect(rows.map((row) => commands.get(row.id).result)).toStrictEqual([
      null,
      { superseded: true, by: ids[3] },
      { superseded: true, by: ids[3] },
      null,
    ]);
  });

  it('never coalesces actions, write-only keys, interrupted commands or other controls, and keeps their order', async () => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    const first = executor.run(
      commands.add({ device_id: lampId, capability: 'power', value: true }),
    );
    await tick();
    const presses = [null, null].map((value) =>
      executor.run(commands.add({ device_id: lampId, capability: 'filter_reset', value })),
    );
    const keys = ['UP', 'UP', 'DOWN', 'OK'].map((value) =>
      executor.run(commands.add({ device_id: lampId, capability: 'remote_key', value })),
    );
    const resumed = executor.run(
      commands.add({ device_id: lampId, capability: 'power', value: false, status: 'running' }),
    );
    const other = executor.run(
      commands.add({ device_id: lampId, capability: 'brightness', value: 5 }),
    );
    await tick();
    for (let release = 0; release < 9; release += 1) {
      adapter.release();
      await tick();
    }
    await Promise.all([first, ...presses, ...keys, resumed, other]);
    const sent = (capability: string): JsonValue[] =>
      adapter.executed
        .filter((command) => command.capability === capability)
        .map((command) => command.value);
    expect(sent('power')).toStrictEqual([true, false]);
    expect(sent('filter_reset')).toStrictEqual([null, null]);
    expect(sent('remote_key')).toStrictEqual(['UP', 'UP', 'DOWN', 'OK']);
    expect(sent('brightness')).toStrictEqual([5]);
  });

  it.each([
    ['sources', ['app', undefined, 'automation', undefined]],
    ['automation runs', ['automation', (): void => undefined, 'automation', (): void => undefined]],
  ] as const)('does not coalesce commands from different %s', async (_name, [sa, ca, sb, cb]) => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    const first = executor.run(
      commands.add({ device_id: lampId, capability: 'brightness', value: 10 }),
    );
    await tick();
    const row = (value: number, source: 'app' | 'automation'): CommandRow =>
      commands.add({ device_id: lampId, capability: 'brightness', value, source });
    const queued = [executor.run(row(80, sa), false, ca), executor.run(row(30, sb), false, cb)];
    for (let release = 0; release < 3; release += 1) {
      adapter.release();
      await tick();
    }
    await Promise.all([first, ...queued]);
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([10, 80, 30]);
  });

  it('keeps one automation run intact when another run refuses its own command', async () => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    const first = executor.run(
      commands.add({ device_id: lampId, capability: 'brightness', value: 10 }),
    );
    await tick();
    const runA = commands.add({
      device_id: lampId,
      capability: 'brightness',
      value: 80,
      source: 'automation',
    });
    const runB = commands.add({
      device_id: lampId,
      capability: 'brightness',
      value: 30,
      source: 'automation',
    });
    const queued = [
      executor.run(runA, false, () => undefined),
      executor.run(runB, false, () => {
        throw new Error('run B cancelled');
      }),
    ];
    for (let release = 0; release < 3; release += 1) {
      adapter.release();
      await tick();
    }
    await Promise.all([first, ...queued]);
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([10, 80]);
    expect(commands.get(runA.id).status).toBe('succeeded');
    expect(commands.get(runB.id).status).toBe('failed');
  });

  it('coalesces rapid commands that share one authorize check', async () => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    const authorize = (): void => undefined;
    const first = executor.run(
      commands.add({ device_id: lampId, capability: 'brightness', value: 10 }),
    );
    await tick();
    const queued = [80, 30].map((value) =>
      executor.run(
        commands.add({
          device_id: lampId,
          capability: 'brightness',
          value,
          source: 'automation',
        }),
        false,
        authorize,
      ),
    );
    for (let release = 0; release < 3; release += 1) {
      adapter.release();
      await tick();
    }
    await Promise.all([first, ...queued]);
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([10, 30]);
  });

  it.each([
    [
      'is refused by its authorize check',
      {},
      (): void => {
        throw new Error('run cancelled');
      },
      'failed',
    ],
    [
      'has already expired',
      { createdAt: new Date('2000-01-01T00:00:00.000Z') },
      undefined,
      'expired',
    ],
  ])(
    'reports the replaced command with the outcome of a replacement that %s',
    async (_name, overrides, authorize, status) => {
      const { commands, adapter, executor, lampId } = await setup(undefined, true);
      const first = executor.run(
        commands.add({ device_id: lampId, capability: 'brightness', value: 10 }),
      );
      await tick();
      const replaced = commands.add({ device_id: lampId, capability: 'brightness', value: 80 });
      const replacement = commands.add({
        device_id: lampId,
        capability: 'brightness',
        value: 30,
        ...overrides,
      });
      const runs = [
        executor.run(replaced, false, authorize),
        executor.run(replacement, false, authorize),
      ];
      adapter.release();
      await Promise.all([first, ...runs]);
      expect(adapter.executed.map((command) => command.value)).toStrictEqual([10]);
      expect(commands.get(replacement.id).status).toBe(status);
      expect(commands.get(replaced.id).status).toBe(status);
    },
  );

  it('keeps an admitted command on its control lane when no section holds it', async () => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    const first = executor.run(
      commands.add({ device_id: lampId, capability: 'power', value: true }),
    );
    await tick();
    const second = executor.run(
      commands.add({ device_id: lampId, capability: 'power', value: false }),
      true,
    );
    await tick();
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([true]);
    adapter.release();
    await tick();
    adapter.release();
    await Promise.all([first, second]);
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([true, false]);
  });

  it('keeps order around an admitted section: commands queued before it still run first', async () => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    const order: string[] = [];
    const before = executor.run(
      commands.add({ device_id: lampId, capability: 'brightness', value: 10 }),
    );
    await tick();
    const section = executor.admit(lampId, 'brightness', async () => {
      order.push('section');
      await Promise.resolve();
    });
    const after = executor.run(
      commands.add({ device_id: lampId, capability: 'brightness', value: 20 }),
    );
    await tick();
    expect(order).toStrictEqual([]);
    adapter.release();
    await section;
    expect(order).toStrictEqual(['section']);
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([10]);
    await tick();
    adapter.release();
    await Promise.all([before, after]);
    expect(adapter.executed.map((command) => command.value)).toStrictEqual([10, 20]);
  });

  it('holds the section open until a command admitted inside it has finished', async () => {
    const { commands, adapter, executor, lampId } = await setup(undefined, true);
    let released = false;
    const section = executor.admit(lampId, 'brightness', () => {
      void executor.run(
        commands.add({ device_id: lampId, capability: 'brightness', value: 50 }),
        true,
      );
      return Promise.resolve();
    });
    const next = executor.admit(lampId, 'brightness', () => {
      released = true;
      return Promise.resolve();
    });
    await tick();
    expect(released).toBe(false);
    adapter.release();
    await Promise.all([section, next]);
    expect(released).toBe(true);
  });
});
