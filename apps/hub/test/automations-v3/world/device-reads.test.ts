import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReadFailure } from '../../../src/automations/world-v3/read-port';
import { furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

const ref = (id: string): { device: string } => ({ device: id });

function failureOf(work: () => unknown): ReadFailure {
  try {
    work();
  } catch (cause) {
    if (cause instanceof ReadFailure) return cause;
    throw cause;
  }
  throw new Error('the read did not fail');
}

describe('device.get', () => {
  it('reads the observed value of one control', () => {
    home.write(home.lampA, 'brightness', 40);
    const { outputs } = home.read('device.get', {
      device: ref(home.lampA.id),
      control: 'brightness',
    });
    expect(outputs['value']).toBe(40);
    expect(outputs['reading']).toBe(40);
    expect(outputs['available']).toBe(true);
  });

  it('uses the power control when none is given', () => {
    home.write(home.lampA, 'power', true);
    expect(home.read('device.get', { device: ref(home.lampA.id) }).outputs['value']).toBe(true);
  });

  it('gives the base value of a temporary change before the observed value', () => {
    home.write(home.lampA, 'brightness', 90);
    home.test.store.deviceEffects.save({
      device_id: home.lampA.id,
      capability: 'brightness',
      base: 30,
      resolved: 90,
      effects: [],
    });
    const { outputs } = home.read('device.get', {
      device: ref(home.lampA.id),
      control: 'brightness',
    });
    expect(outputs['value']).toBe(30);
  });

  it('gives the pending intended value before the observed one until the device reports again', () => {
    home.write(home.lampA, 'brightness', 10, '2026-10-18T11:59:00.000Z');
    home.intended.set(`${home.lampA.id}:brightness`, {
      value: 80,
      completedAt: Date.parse('2026-10-18T11:59:30.000Z'),
    });
    const read = (): unknown =>
      home.read('device.get', { device: ref(home.lampA.id), control: 'brightness' }).outputs[
        'value'
      ];
    expect(read()).toBe(80);
    home.write(home.lampA, 'brightness', 75, '2026-10-18T11:59:50.000Z');
    expect(read()).toBe(75);
  });

  it('answers null as the value and no reading when the control was never observed', () => {
    const { outputs } = home.read('device.get', {
      device: ref(home.lampB.id),
      control: 'brightness',
    });
    expect(outputs['value']).toBeNull();
    expect('reading' in outputs).toBe(false);
    expect('changedAt' in outputs).toBe(false);
  });

  it('reports the previous value, when it changed and how long it has held', () => {
    home.write(home.lampA, 'brightness', 20, '2026-10-18T10:00:00.000Z');
    home.write(home.lampA, 'brightness', 60, '2026-10-18T11:00:00.000Z');
    home.write(home.lampA, 'brightness', 60, '2026-10-18T11:30:00.000Z');
    const { outputs } = home.read('device.get', {
      device: ref(home.lampA.id),
      control: 'brightness',
    });
    expect(outputs).toMatchObject({
      value: 60,
      previous: 20,
      changedAt: '2026-10-18T11:00:00.000Z',
      inStateFor: 3_600_000,
    });
  });

  it('shows no change history for a value that comes from a temporary change', () => {
    home.write(home.lampA, 'brightness', 90, '2026-10-18T11:00:00.000Z');
    home.test.store.deviceEffects.save({
      device_id: home.lampA.id,
      capability: 'brightness',
      base: 30,
      resolved: 90,
      effects: [],
    });
    const { outputs } = home.read('device.get', {
      device: ref(home.lampA.id),
      control: 'brightness',
    });
    expect('changedAt' in outputs).toBe(false);
  });

  it('reports a device that is offline as not available', () => {
    expect(home.read('device.get', { device: ref(home.lampC.id) }).outputs['available']).toBe(
      false,
    );
  });

  it('fails with NotFound for a device or a control that does not exist', () => {
    expect(failureOf(() => home.read('device.get', { device: ref('nobody') })).errorClass).toBe(
      'NotFound',
    );
    expect(
      failureOf(() =>
        home.read('device.get', { device: ref(home.lampA.id), control: 'oscillation' }),
      ).errorClass,
    ).toBe('NotFound');
  });

  it('fails with Invalid for a control that cannot be read or is not a control', () => {
    expect(
      failureOf(() =>
        home.read('device.get', { device: ref(home.lampC.id), control: 'child_lock' }),
      ).errorClass,
    ).toBe('Invalid');
    expect(
      failureOf(() => home.read('device.get', { device: ref(home.lampA.id), control: 'nonsense' }))
        .errorClass,
    ).toBe('Invalid');
    expect(failureOf(() => home.read('device.get', { device: 'lamp' })).errorClass).toBe('Invalid');
  });
});

describe('device.health', () => {
  it('reads online, battery, last seen and provider', () => {
    home.write(home.sensor, 'battery', 64, '2026-10-18T09:00:00.000Z');
    home.write(home.sensor, 'temperature', 21, '2026-10-18T11:00:00.000Z');
    const { outputs } = home.read('device.health', { device: ref(home.sensor.id) });
    expect(outputs).toEqual({
      online: true,
      battery: 64,
      lastSeen: '2026-10-18T11:00:00.000Z',
      provider: 'local',
    });
  });

  it('leaves battery and last seen out when the device has none', () => {
    const { outputs } = home.read('device.health', { device: ref(home.lampC.id) });
    expect(outputs).toEqual({ online: false, provider: 'local' });
  });

  it('fails with NotFound for an unknown device', () => {
    expect(failureOf(() => home.read('device.health', { device: ref('x') })).errorClass).toBe(
      'NotFound',
    );
  });
});
