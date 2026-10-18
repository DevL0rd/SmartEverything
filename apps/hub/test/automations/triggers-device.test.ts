import { describe, expect, it } from 'vitest';
import { createAutomation, setBrightness, setPower } from './support/programs';
import { useRig } from './support/use-rig';

const rig = useRig();

async function sentCount(count: number): Promise<void> {
  await rig().until(() => rig().commands().length >= count);
  await rig().settle();
}

describe('C1 multiple triggers', () => {
  it('runs the actions once for each trigger that fires, whichever trigger it was', async () => {
    const { ids } = rig();
    await createAutomation(rig(), 'Either', {
      triggers: [
        { type: 'event', deviceId: null, kind: 'doorbell' },
        {
          type: 'state',
          deviceId: ids.sensor,
          capability: 'occupancy',
          comparison: { operator: 'eq', value: true },
        },
      ],
      actions: [setBrightness(ids.lamp, 30)],
    });
    await rig().state('sensor-1', 'occupancy', false);
    await rig().event('lamp-1', 'doorbell');
    await sentCount(1);
    await rig().state('sensor-1', 'occupancy', true);
    await sentCount(2);
    expect(rig().sent()).toStrictEqual([
      ['lamp-1', 'brightness', 30],
      ['lamp-1', 'brightness', 30],
    ]);
  });

  it('never runs a disabled automation', async () => {
    const { ids } = rig();
    await createAutomation(
      rig(),
      'Paused',
      {
        triggers: [{ type: 'event', deviceId: null, kind: 'doorbell' }],
        actions: [setPower(ids.lamp, true)],
      },
      false,
    );
    await rig().event('lamp-1', 'doorbell');
    await rig().settle();
    expect(rig().sent()).toStrictEqual([]);
  });
});

describe('C5 device value triggers', () => {
  const warm = (threshold: number): Parameters<typeof createAutomation>[2] => ({
    triggers: [
      {
        type: 'state',
        deviceId: rig().ids.sensor,
        capability: 'temperature',
        comparison: { operator: 'gt', value: threshold },
      },
    ],
    actions: [setPower(rig().ids.lamp, true)],
  });

  it('fires when the comparison becomes true and not while it stays true', async () => {
    await createAutomation(rig(), 'Warm', warm(25));
    await rig().state('sensor-1', 'temperature', 20);
    await rig().state('sensor-1', 'temperature', 26);
    await sentCount(1);
    await rig().state('sensor-1', 'temperature', 27);
    await rig().state('sensor-1', 'temperature', 28);
    await rig().settle();
    expect(rig().commands()).toHaveLength(1);
  });

  it('fires again after the comparison turned false and became true again', async () => {
    await createAutomation(rig(), 'Warm', warm(25));
    await rig().state('sensor-1', 'temperature', 20);
    await rig().state('sensor-1', 'temperature', 26);
    await sentCount(1);
    await rig().state('sensor-1', 'temperature', 22);
    await rig().state('sensor-1', 'temperature', 30);
    await sentCount(2);
    expect(rig().commands()).toHaveLength(2);
  });

  it('does not fire for a value that never satisfies the comparison', async () => {
    await createAutomation(rig(), 'Warm', warm(25));
    await rig().state('sensor-1', 'temperature', 10);
    await rig().state('sensor-1', 'temperature', 24.9);
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
  });

  it('fires on a changed comparison for every different value and not for a repeated one', async () => {
    const { ids } = rig();
    await rig().state('sensor-1', 'temperature', 5);
    await createAutomation(rig(), 'Any change', {
      triggers: [
        {
          type: 'state',
          deviceId: ids.sensor,
          capability: 'temperature',
          comparison: { operator: 'changed' },
        },
      ],
      actions: [setPower(ids.lamp, true)],
    });
    await rig().state('sensor-1', 'temperature', 11);
    await rig().state('sensor-1', 'temperature', 12);
    await rig().state('sensor-1', 'temperature', 12);
    await rig().state('sensor-1', 'temperature', 13);
    await sentCount(3);
    expect(rig().commands()).toHaveLength(3);
  });

  it('fires when a value enters a between range inclusive of both ends', async () => {
    const { ids } = rig();
    await createAutomation(rig(), 'Comfort', {
      triggers: [
        {
          type: 'state',
          deviceId: ids.sensor,
          capability: 'temperature',
          comparison: { operator: 'between', min: 20, max: 22 },
        },
      ],
      actions: [setPower(ids.lamp, true)],
    });
    await rig().state('sensor-1', 'temperature', 15);
    await rig().state('sensor-1', 'temperature', 20);
    await sentCount(1);
    expect(rig().commands()).toHaveLength(1);
  });

  it('compares booleans for equality and fires only for the named device and capability', async () => {
    const { ids } = rig();
    await createAutomation(rig(), 'Occupied', {
      triggers: [
        {
          type: 'state',
          deviceId: ids.sensor,
          capability: 'occupancy',
          comparison: { operator: 'eq', value: true },
        },
      ],
      actions: [setPower(ids.lamp, true)],
    });
    await rig().state('sensor-1', 'occupancy', false);
    await rig().state('sensor-1', 'temperature', 40);
    await rig().state('lamp-1', 'power', true);
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    await rig().state('sensor-1', 'occupancy', true);
    await sentCount(1);
    expect(rig().sent()).toStrictEqual([['lamp-1', 'power', true]]);
  });
});

describe('C6 device and home events', () => {
  it('fires on an event of the kind from any device when no device is named', async () => {
    const { ids } = rig();
    await createAutomation(rig(), 'Anyone', {
      triggers: [{ type: 'event', deviceId: null, kind: 'motion' }],
      actions: [setPower(ids.lamp, true)],
    });
    await rig().event('sensor-1', 'motion');
    await rig().event('fan-1', 'motion');
    await sentCount(2);
    expect(rig().commands()).toHaveLength(2);
  });

  it('fires only for the named device and only for the named kind', async () => {
    const { ids } = rig();
    await createAutomation(rig(), 'Sensor motion', {
      triggers: [{ type: 'event', deviceId: ids.sensor, kind: 'motion' }],
      actions: [setPower(ids.lamp, true)],
    });
    await rig().event('fan-1', 'motion');
    await rig().event('sensor-1', 'doorbell');
    await rig().settle();
    expect(rig().commands()).toHaveLength(0);
    await rig().event('sensor-1', 'motion');
    await sentCount(1);
    expect(rig().commands()).toHaveLength(1);
  });
});
