import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { createAutomation, nodeId, setBrightness, type Steps } from './support/programs';
import { startAndFinish } from './support/runs';
import { useRig } from './support/use-rig';
import { boundCommand, createValue, fromDevice, fromValue, numberValue } from './support/values';
import { legacyAutomation } from '../support/legacy-automation';

const rig = useRig();

async function runSteps(actions: Steps): Promise<Awaited<ReturnType<typeof startAndFinish>>> {
  const row = await createAutomation(rig(), 'Bound', { actions });
  return startAndFinish(rig(), row.id);
}

describe('C13 command values from Values, device readings and offsets', () => {
  it('sends the current number of a Value', async () => {
    const level = await numberValue(rig(), 'Level', 40);
    await runSteps([boundCommand(rig().ids.lamp, 'brightness', fromValue(level.id, 'number'))]);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'brightness', 40]]);
  });

  it('adds and subtracts an offset to the resolved number', async () => {
    const level = await numberValue(rig(), 'Level', 40);
    await runSteps([
      boundCommand(
        rig().ids.lamp,
        'brightness',
        fromValue(level.id, 'number', { operation: 'add', amount: 10, unit: 'number' }),
      ),
      boundCommand(
        rig().ids.lampTwo,
        'brightness',
        fromValue(level.id, 'number', { operation: 'subtract', amount: 15, unit: 'number' }),
      ),
    ]);
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'brightness', 50],
      ['lamp-2', 'brightness', 25],
    ]);
  });

  it('fails the run when the offset result leaves the input bounds', async () => {
    const level = await numberValue(rig(), 'Level', 95);
    const run = await runSteps([
      boundCommand(
        rig().ids.lamp,
        'brightness',
        fromValue(level.id, 'number', {
          operation: 'add',
          amount: 10,
          unit: 'number',
          maximum: 100,
        }),
      ),
    ]);
    expect(run.status).toBe('failed');
    expect(run.error).toContain('exceeds the input bounds');
    expect(rig().sent()).toStrictEqual([]);
  });

  it('sends a duration Value as milliseconds to a control measured in milliseconds', async () => {
    const wait = await createValue(rig(), {
      kind: 'duration',
      name: 'Wait',
      value: 5000,
      bounds: { overflow: 'reject' },
    });
    await runSteps([boundCommand(rig().ids.fan, 'off_timer', fromValue(wait.id, 'duration'))]);
    expect(rig().sent()).toStrictEqual([['fan-1', 'off_timer', 5000]]);
  });

  it('reads a live device value when the step runs', async () => {
    await rig().state('sensor-1', 'temperature', 30);
    await runSteps([
      boundCommand(rig().ids.lamp, 'brightness', fromDevice(rig().ids.sensor, 'temperature')),
    ]);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'brightness', 30]]);
  });

  it('reads the value just commanded rather than the older observed one', async () => {
    await rig().state('lamp-1', 'brightness', 80);
    await runSteps([
      setBrightness(rig().ids.lamp, 20),
      boundCommand(
        rig().ids.lampTwo,
        'brightness',
        fromDevice(rig().ids.lamp, 'brightness', { operation: 'add', amount: 10, unit: 'number' }),
      ),
    ]);
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'brightness', 20],
      ['lamp-2', 'brightness', 30],
    ]);
  });

  it('sends each named argument of an action control from its own input', async () => {
    const times = await numberValue(rig(), 'Times', 3);
    await runSteps([
      {
        type: 'command',
        nodeId: nodeId(),
        deviceId: rig().ids.fan,
        capability: 'raw:blink',
        binding: {
          type: 'fields',
          fields: {
            times: fromValue(times.id, 'number', { operation: 'add', amount: 1, unit: 'number' }),
            rate: { binding: { source: 'literal', kind: 'number', value: 2 } },
          },
        },
      },
    ]);
    expect(rig().sent()).toStrictEqual([['fan-1', 'raw:blink', { times: 4, rate: 2 }]]);
  });

  it('picks up a changed Value on the next run', async () => {
    const level = await numberValue(rig(), 'Level', 40);
    const row = await createAutomation(rig(), 'Follows', {
      actions: [boundCommand(rig().ids.lamp, 'brightness', fromValue(level.id, 'number'))],
    });
    await startAndFinish(rig(), row.id);
    await rig().request(API_ENDPOINTS.applyAutomationValueOperation, {
      params: { valueId: level.id },
      body: { kind: 'number', operation: { type: 'set', value: 65 } },
    });
    await startAndFinish(rig(), row.id);
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'brightness', 40],
      ['lamp-1', 'brightness', 65],
    ]);
  });

  it('refuses to save a Value that cannot fit the control it drives', async () => {
    const flag = await createValue(rig(), { kind: 'boolean', name: 'Flag', value: true });
    const refusal = await rig().refused(API_ENDPOINTS.createAutomation, {
      body: {
        name: 'Mismatch',
        definition: legacyAutomation({
          triggers: [{ type: 'interval', everyMinutes: 60 }],
          conditions: { mode: 'all', items: [] },
          actions: [boundCommand(rig().ids.lamp, 'brightness', fromValue(flag.id, 'boolean'))],
        }),
      },
    });
    expect(refusal.status).toBe(400);
    expect(refusal.message).toContain('does not fit');
  });
});
