import type { DeviceCommand } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriteConfirmations } from '../../src/adapters/xiaomi/write-confirmations';
import { waitFor } from './harness';
import { createWorld, destroyWorld, startAdapter, subscribe, type World } from './world';

let world: World;

beforeEach(async () => {
  world = await createWorld();
});

afterEach(async () => {
  await destroyWorld(world);
});

function setMode(value: string): DeviceCommand {
  return {
    commandId: crypto.randomUUID(),
    externalId: '100001',
    capability: 'purifier_mode',
    value,
  };
}

function modes(recorded: Awaited<ReturnType<typeof subscribe>>): string[] {
  return recorded.states
    .filter((state) => state.capability === 'purifier_mode')
    .map((state) => JSON.stringify(state.value));
}

async function pushingPurifier(): Promise<{
  adapter: Awaited<ReturnType<typeof startAdapter>>;
  recorded: Awaited<ReturnType<typeof subscribe>>;
}> {
  world.purifier.offersPush = true;
  const adapter = await startAdapter(world);
  await adapter.discover();
  const recorded = await subscribe(world, adapter);
  await waitFor(() => modes(recorded).length > 0);
  world.purifier.requests.length = 0;
  recorded.states.length = 0;
  return { adapter, recorded };
}

function notConfirmed(): { payload: Record<string, unknown> }[] {
  return world.harness.logs.filter((record) => record.event === 'xiaomi.write_not_confirmed');
}

describe('a write to a LAN device that pushes its changes', () => {
  it('sends the write only and lets the pushed property update the state', async () => {
    world.purifier.pushAfterWriteMs = 40;
    const { adapter, recorded } = await pushingPurifier();
    await expect(adapter.execute(setMode('Sleep'))).resolves.toBe('Sleep');
    expect(world.purifier.requests.map((request) => request.method)).toStrictEqual([
      'set_properties',
    ]);
    await waitFor(() => modes(recorded).includes('"Sleep"'));
    expect(world.purifier.requests.map((request) => request.method)).toStrictEqual([
      'set_properties',
    ]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(notConfirmed()).toStrictEqual([]);
  });

  it('logs a write the device never pushed back, once, without sending it again', async () => {
    const { adapter } = await pushingPurifier();
    await adapter.execute(setMode('Sleep'));
    await waitFor(() => notConfirmed().length > 0);
    expect(notConfirmed()).toHaveLength(1);
    expect(notConfirmed()[0]?.payload).toMatchObject({ did: '100001', property: 'purifier_mode' });
    expect(Number(notConfirmed()[0]?.payload['elapsedMs'])).toBeGreaterThanOrEqual(300);
    expect(world.purifier.requests.map((request) => request.method)).toStrictEqual([
      'set_properties',
    ]);
  });

  it('expects no push for a value the device already holds', async () => {
    const { adapter } = await pushingPurifier();
    await adapter.execute({
      commandId: crypto.randomUUID(),
      externalId: '100001',
      capability: 'power',
      value: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(notConfirmed()).toStrictEqual([]);
  });

  it('reads every readable property when the subscription starts', async () => {
    world.purifier.offersPush = true;
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    await waitFor(() => recorded.states.length >= 4);
    expect(recorded.states.map((state) => state.capability).sort()).toStrictEqual([
      'filter_life',
      'pm25',
      'power',
      'purifier_mode',
    ]);
  });
});

describe('a write where no push exists', () => {
  it('resolves on the write reply and reads the property back in the background', async () => {
    world.purifier.replyDelayMs = 60;
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    await waitFor(() => modes(recorded).length > 0);
    recorded.states.length = 0;
    await adapter.execute(setMode('Sleep'));
    expect(modes(recorded)).toStrictEqual([]);
    await waitFor(() => modes(recorded).includes('"Sleep"'));
  });

  it('reads a cloud write back in the background', async () => {
    const adapter = await startAdapter(world);
    await adapter.discover();
    const recorded = await subscribe(world, adapter);
    await adapter.execute({
      commandId: crypto.randomUUID(),
      externalId: '100003',
      capability: 'night_vision',
      value: 'Off',
    });
    await waitFor(() =>
      recorded.states.some(
        (state) => state.externalId === '100003' && state.capability === 'night_vision',
      ),
    );
    expect(
      world.harness.logs.filter((record) => record.event.endsWith('read_back_failed')),
    ).toStrictEqual([]);
  });
});

describe('the write confirmation watch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function watch(logs: { event: string; payload: Record<string, unknown> }[]): WriteConfirmations {
    Logger.reset();
    Logger.configure({ level: 'trace', sink: (record) => logs.push(record) });
    return new WriteConfirmations({
      did: 'd1',
      windowMs: 5000,
      now: () => Date.now(),
      log: new Logger('tool.xiaomi-test'),
    });
  }

  it('logs the device, the property and the elapsed time when the window passes', () => {
    vi.useFakeTimers();
    const logs: { event: string; payload: Record<string, unknown> }[] = [];
    const confirmations = watch(logs);
    confirmations.expect('power');
    vi.advanceTimersByTime(4999);
    expect(logs).toStrictEqual([]);
    vi.advanceTimersByTime(1);
    expect(logs.map((record) => [record.event, record.payload])).toStrictEqual([
      ['xiaomi.write_not_confirmed', { did: 'd1', property: 'power', elapsedMs: 5000 }],
    ]);
  });

  it('stays silent once the property arrived or the watch closed', () => {
    vi.useFakeTimers();
    const logs: { event: string; payload: Record<string, unknown> }[] = [];
    const confirmations = watch(logs);
    confirmations.expect('power');
    confirmations.expect('purifier_mode');
    vi.advanceTimersByTime(1000);
    confirmations.arrived('power');
    confirmations.close();
    vi.advanceTimersByTime(10_000);
    expect(logs).toStrictEqual([]);
  });

  it('restarts the window when the same property is written again', () => {
    vi.useFakeTimers();
    const logs: { event: string; payload: Record<string, unknown> }[] = [];
    const confirmations = watch(logs);
    confirmations.expect('power');
    vi.advanceTimersByTime(3000);
    confirmations.expect('power');
    vi.advanceTimersByTime(3000);
    expect(logs).toStrictEqual([]);
    vi.advanceTimersByTime(2000);
    expect(logs).toHaveLength(1);
  });
});
