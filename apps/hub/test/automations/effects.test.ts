import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, nodeId, type Conditions, type Step } from './support/programs';
import { startRun, statusOf } from './support/runs';
import { useRig } from './support/use-rig';
import { legacyAutomation } from '../support/legacy-automation';

const rig = useRig({ fresh: true });

type Effect = Extract<Step, { type: 'temporary_effect' }>;

interface Options {
  readonly priority?: number;
  readonly whileHolds?: Conditions;
}

function temporary(
  deviceId: string,
  operation: Effect['operation'],
  durationMs: number,
  options: Options = {},
): Step {
  const { priority = 0, whileHolds } = options;
  return {
    type: 'temporary_effect',
    nodeId: nodeId(),
    target: { kind: 'devices', deviceIds: [deviceId] },
    capability: 'brightness',
    operation,
    durationMs,
    priority,
    ...(whileHolds === undefined ? {} : { while: whileHolds }),
  };
}

function occupied(): Conditions {
  return {
    mode: 'all',
    items: [
      {
        type: 'state',
        deviceId: rig().ids.sensor,
        capability: 'occupancy',
        comparison: { operator: 'eq', value: true },
      },
    ],
  };
}

const BASE = 60;

async function dimmed(
  step: Step,
  name = 'Dim',
): Promise<{ readonly run: Awaited<ReturnType<typeof startRun>>; readonly id: string }> {
  const row = await createAutomation(rig(), name, { actions: [step] });
  const run = await startRun(rig(), row.id);
  return { run, id: row.id };
}

async function waitForSent(count: number): Promise<void> {
  await rig().until(() => rig().commands().length >= count);
}

function advanceMs(ms: number): void {
  rig().clock.advanceTo(new Date(rig().clock.now().getTime() + ms).toISOString());
}

describe('C19 temporary change', () => {
  it('sets the value for the duration and then returns the control to its base', async () => {
    await rig().state('lamp-1', 'brightness', BASE);
    const { run } = await dimmed(temporary(rig().ids.lamp, { type: 'set', value: 20 }, 600_000));
    await waitForSent(1);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'brightness', 20]]);
    expect(await statusOf(rig(), run.id)).toBe('running');
    advanceMs(600_000);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'brightness', 20],
      ['lamp-1', 'brightness', BASE],
    ]);
  });

  it('lists the base and the stacked changes while they last and forgets the control afterwards', async () => {
    await rig().state('lamp-1', 'brightness', BASE);
    await dimmed(
      temporary(rig().ids.lamp, { type: 'set', value: 20 }, 3_600_000, { priority: 0 }),
      'Low',
    );
    await waitForSent(1);
    const { run } = await dimmed(
      temporary(rig().ids.lamp, { type: 'set', value: 80 }, 600_000, { priority: 10 }),
      'High',
    );
    await waitForSent(2);
    const [target, ...others] = await rig().request(API_ENDPOINTS.listDeviceEffects);
    expect(others).toStrictEqual([]);
    expect(target).toMatchObject({ capability: 'brightness', base: BASE, resolved: 80 });
    expect(target?.effects.map((effect) => effect.operation)).toStrictEqual([
      { type: 'set', value: 20 },
      { type: 'set', value: 80 },
    ]);
    advanceMs(600_000);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    const remaining = await rig().request(API_ENDPOINTS.listDeviceEffects);
    expect(remaining.map((entry) => entry.resolved)).toStrictEqual([20]);
    advanceMs(3_000_000);
    await rig().until(
      async () => (await rig().request(API_ENDPOINTS.listDeviceEffects)).length === 0,
    );
  });

  it('adds to a numeric control and returns to the base afterwards', async () => {
    await rig().state('lamp-1', 'brightness', 50);
    const { run } = await dimmed(temporary(rig().ids.lamp, { type: 'add', value: 10 }, 60_000));
    await waitForSent(1);
    advanceMs(60_000);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'brightness', 60],
      ['lamp-1', 'brightness', 50],
    ]);
  });

  it('lets the higher priority win and falls back to the lower one when it ends', async () => {
    await rig().state('lamp-1', 'brightness', BASE);
    await dimmed(
      temporary(rig().ids.lamp, { type: 'set', value: 20 }, 3_600_000, { priority: 0 }),
      'Low',
    );
    await waitForSent(1);
    await dimmed(
      temporary(rig().ids.lamp, { type: 'set', value: 80 }, 600_000, { priority: 10 }),
      'High',
    );
    await waitForSent(2);
    advanceMs(600_000);
    await waitForSent(3);
    advanceMs(3_000_000);
    await waitForSent(4);
    expect(
      rig()
        .sent()
        .map(([, , value]) => value),
    ).toStrictEqual([20, 80, 20, BASE]);
  });

  it('applies the later change on top when priorities are equal', async () => {
    await rig().state('lamp-1', 'brightness', BASE);
    await dimmed(temporary(rig().ids.lamp, { type: 'set', value: 20 }, 3_600_000), 'First');
    await waitForSent(1);
    await dimmed(temporary(rig().ids.lamp, { type: 'set', value: 35 }, 3_600_000), 'Second');
    await waitForSent(2);
    expect(
      rig()
        .sent()
        .map(([, , value]) => value),
    ).toStrictEqual([20, 35]);
  });

  it('ends the change when the run is stopped so a later command is not overridden by it', async () => {
    await rig().state('lamp-1', 'brightness', BASE);
    const { run } = await dimmed(temporary(rig().ids.lamp, { type: 'set', value: 20 }, 3_600_000));
    await waitForSent(1);
    await rig().request(API_ENDPOINTS.stopAutomationRun, { params: { runId: run.id } });
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'cancelled');
    await rig().request(API_ENDPOINTS.sendCommand, {
      body: { device_id: rig().ids.lamp, capability: 'brightness', value: 40 },
    });
    await rig().until(() =>
      rig()
        .commands()
        .some((command) => command.value === 40),
    );
    expect(
      rig()
        .sent()
        .map(([, , value]) => value),
    ).toContain(40);
  });

  it('ends the change early when its while-conditions stop holding', async () => {
    await rig().state('sensor-1', 'occupancy', true);
    await rig().state('lamp-1', 'brightness', BASE);
    const step = temporary(rig().ids.lamp, { type: 'set', value: 20 }, 3_600_000, {
      whileHolds: occupied(),
    });
    const { run } = await dimmed(step);
    await waitForSent(1);
    await rig().state('sensor-1', 'occupancy', false);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    expect(
      rig()
        .sent()
        .map(([, , value]) => value),
    ).toStrictEqual([20, BASE]);
  });

  it('does nothing when the while-conditions are false from the start', async () => {
    await rig().state('sensor-1', 'occupancy', false);
    await rig().state('lamp-1', 'brightness', BASE);
    const step = temporary(rig().ids.lamp, { type: 'set', value: 20 }, 3_600_000, {
      whileHolds: occupied(),
    });
    const { run } = await dimmed(step);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    expect(rig().sent()).toStrictEqual([]);
  });

  it('keeps the change in force when a permanent value is written and returns to that value afterwards', async () => {
    await rig().state('lamp-1', 'brightness', BASE);
    const { run } = await dimmed(temporary(rig().ids.lamp, { type: 'set', value: 20 }, 600_000));
    await waitForSent(1);
    await rig().request(API_ENDPOINTS.sendCommand, {
      body: { device_id: rig().ids.lamp, capability: 'brightness', value: 40 },
    });
    await waitForSent(2);
    advanceMs(600_000);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    expect(
      rig()
        .sent()
        .map(([, , value]) => value),
    ).toStrictEqual([20, 20, 40]);
  });

  it('treats a change reported by the device as the new base, keeps the change in force and returns to that base', async () => {
    await rig().state('lamp-1', 'brightness', BASE);
    const { run } = await dimmed(temporary(rig().ids.lamp, { type: 'set', value: 20 }, 600_000));
    await waitForSent(1);
    await rig().state('lamp-1', 'brightness', 75);
    await rig().settle();
    advanceMs(600_000);
    await rig().until(async () => (await statusOf(rig(), run.id)) === 'succeeded');
    expect(
      rig()
        .sent()
        .map(([, , value]) => value),
    ).toStrictEqual([20, 20, 75]);
  });

  it('refuses to save a change that no target control supports', async () => {
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Unsupported',
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 60 }],
          conditions: { mode: 'all', items: [] },
          actions: [
            {
              ...temporary(rig().ids.fan, { type: 'set', value: 20 }, 1000),
              capability: 'brightness',
            },
          ],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('No target device supports');
  });
});
