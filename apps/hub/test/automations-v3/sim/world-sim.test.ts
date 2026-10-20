import { randomUUID } from 'node:crypto';
import type { LiveChange } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EffectsSim } from '../../../src/automations/sim/effects-sim';
import type { EffectScript } from '../../../src/automations/sim/scenario';
import { ScenarioWorld } from '../../../src/automations/sim/world-sim';
import { SCOPE, furnish } from '../world/support';
import type { Home } from '../world/support';

let home: Home;
let world: ScenarioWorld;

beforeEach(async () => {
  home = await furnish();
  world = new ScenarioWorld(home.deps, { now: (): Date => home.clock.current });
});

afterEach(async () => {
  await home.test.close();
});

function deviceGet(id: string, control?: string): Record<string, unknown> {
  const inputs = { device: { device: id }, ...(control === undefined ? {} : { control }) };
  return world.reads().read('device.get', inputs, SCOPE).outputs;
}

function request(kind: string, params: EffectRequest['params']): EffectRequest {
  return {
    kind,
    node: { id: 'n1', key: 'n1' },
    path: 'root/0',
    activation: 'root:0',
    key: 'run/root:0',
    params,
    retry: 'idempotent',
    budget: 'none',
  };
}

function effects(scripts: readonly EffectScript[] = [], applyToWorld = true): EffectsSim {
  return new EffectsSim({
    clock: { now: () => home.clock.current, at: () => () => undefined },
    world,
    scripts,
    applyToWorld,
    children: () => Promise.resolve({ ok: true, value: {} }),
  });
}

const scope = {
  runId: randomUUID(),
  automationId: SCOPE.automationId,
  signal: new AbortController().signal,
};

describe('ScenarioWorld reads', () => {
  it('shows a simulated value and leaves the live home untouched', () => {
    home.write(home.lampA, 'brightness', 40);
    world.setDevice(home.lampA.id, 'brightness', 75);
    expect(deviceGet(home.lampA.id, 'brightness')['value']).toBe(75);
    expect(
      home.read('device.get', { device: { device: home.lampA.id }, control: 'brightness' }).outputs[
        'value'
      ],
    ).toBe(40);
  });

  it('keeps the previous value and counts the time in state from the virtual clock', () => {
    world.setDevice(home.lampA.id, 'brightness', 10);
    world.setDevice(home.lampA.id, 'brightness', 20);
    home.clock.current = new Date(home.clock.current.getTime() + 90_000);
    const read = deviceGet(home.lampA.id, 'brightness');
    expect(read).toMatchObject({ value: 20, previous: 10, inStateFor: 90_000, available: true });
  });

  it('reads the power control when none is named', () => {
    world.setDevice(home.lampA.id, 'power', true);
    expect(deviceGet(home.lampA.id)['value']).toBe(true);
  });

  it('falls through to the live reading for a control nobody simulated', () => {
    home.write(home.sensor, 'temperature', 21);
    expect(deviceGet(home.sensor.id, 'temperature')['value']).toBe(21);
  });

  it('overlays an automation variable without writing the live one', () => {
    home.persistent.set(`${SCOPE.automationId}:count`, { value: 1, revision: 4 });
    world.setVariable(SCOPE.automationId, 'count', 9);
    const read = world
      .reads()
      .read('var.get', { source: 'automation', name: 'count' }, SCOPE).outputs;
    expect(read).toMatchObject({ value: 9, revision: 5 });
    expect(home.persistent.get(`${SCOPE.automationId}:count`)).toEqual({ value: 1, revision: 4 });
  });

  it('publishes a device_state change to a subscriber', () => {
    const seen: LiveChange[] = [];
    world.feed.subscribe((change) => seen.push(change));
    world.setDevice(home.lampA.id, 'power', true);
    world.setDevice(home.lampA.id, 'power', false);
    expect(seen.map((change) => change.operation)).toEqual(['INSERT', 'UPDATE']);
    expect(seen[1]).toMatchObject({
      table: 'device_state',
      record: { capability: 'power', value: false },
      oldRecord: { value: true },
    });
  });
});

describe('EffectsSim', () => {
  it('records a would-be command and moves the scenario world', async () => {
    const sim = effects();
    const result = await sim.perform(
      request('device.set', { target: { device: home.lampA.id }, control: 'brightness', to: 60 }),
      scope,
    );
    expect(result).toMatchObject({ ok: true, value: { ok: true, value: 60 } });
    expect(sim.sent[0]).toMatchObject({
      kind: 'device.set',
      targets: [home.lampA.id],
      outcome: 'ok',
    });
    expect(deviceGet(home.lampA.id, 'brightness')['value']).toBe(60);
  });

  it('adds a relative change to the simulated value', async () => {
    world.setDevice(home.lampA.id, 'brightness', 50);
    await effects().perform(
      request('device.set', { target: { device: home.lampA.id }, control: 'brightness', by: -20 }),
      scope,
    );
    expect(deviceGet(home.lampA.id, 'brightness')['value']).toBe(30);
  });

  it('toggles every device of a room', async () => {
    world.setDevice(home.lampA.id, 'power', true);
    const sim = effects();
    await sim.perform(request('device.toggle', { target: { room: home.kitchen.id } }), scope);
    expect(deviceGet(home.lampA.id)['value']).toBe(false);
    expect(deviceGet(home.lampB.id)['value']).toBe(true);
    expect(sim.sent[0]?.targets).toEqual(expect.arrayContaining([home.lampA.id, home.lampB.id]));
  });

  it('records but does not apply when the run is a dry run', async () => {
    const sim = effects([], false);
    await sim.perform(
      request('device.set', { target: { device: home.lampA.id }, control: 'brightness', to: 99 }),
      scope,
    );
    expect(sim.sent).toHaveLength(1);
    expect(deviceGet(home.lampA.id, 'brightness')['value']).toBeNull();
  });

  it('leaves the world alone when the scripted outcome is a failure', async () => {
    const sim = effects([
      { device: home.lampA.id, outcome: { kind: 'fail', class: 'Refused', message: 'no' } },
    ]);
    const result = await sim.perform(
      request('device.set', { target: { device: home.lampA.id }, control: 'brightness', to: 5 }),
      scope,
    );
    expect(result).toMatchObject({ ok: false, class: 'Refused', message: 'no' });
    expect(deviceGet(home.lampA.id, 'brightness')['value']).toBeNull();
    expect(sim.sent[0]?.outcome).toBe('fail');
  });

  it('answers NotFound for a target the home does not have', async () => {
    const result = await effects().perform(
      request('device.set', { target: { device: randomUUID() }, to: true }),
      scope,
    );
    expect(result).toMatchObject({ ok: false, class: 'NotFound' });
  });

  it('writes an automation variable into the overlay only', async () => {
    await effects().perform(
      request('var.set', { source: 'automation', target: 'mode', to: 'night' }),
      scope,
    );
    const read = world.reads().read('var.get', { source: 'automation', name: 'mode' }, SCOPE);
    expect(read.outputs['value']).toBe('night');
    expect(home.persistent.size).toBe(0);
  });

  it('applies a variable change on top of the simulated value', async () => {
    world.setVariable(SCOPE.automationId, 'count', 0);
    const sim = effects();
    const add = request('var.change', {
      source: 'automation',
      target: 'count',
      change: { op: 'add', edge: 'wrap', amount: 2 },
    });
    await sim.perform(add, scope);
    const second = await sim.perform(add, scope);
    expect(second).toMatchObject({ ok: true, value: { value: 4, previous: 2 } });
    expect(world.variable(SCOPE.automationId, 'count')?.value).toBe(4);
  });

  it('keeps the data of each Custom Node use apart and carries it between calls', async () => {
    const sim = effects();
    const kept = (instance: string): EffectRequest =>
      request('var.change', {
        source: 'automation',
        target: 'step',
        instance,
        type: { t: 'number' },
        initial: 0,
        change: { op: 'add', edge: 'wrap', amount: 1 },
      });
    await sim.perform(kept('use-a'), scope);
    await sim.perform(kept('use-a'), scope);
    await sim.perform(kept('use-b'), scope);
    const step = { instance: 'use-a', type: { t: 'number' } } as const;
    expect(world.variable(SCOPE.automationId, 'step', step)?.value).toBe(2);
    expect(world.variable(SCOPE.automationId, 'step', { ...step, instance: 'use-b' })?.value).toBe(
      1,
    );
    expect(world.variable(SCOPE.automationId, 'step')).toBeUndefined();
  });
});
