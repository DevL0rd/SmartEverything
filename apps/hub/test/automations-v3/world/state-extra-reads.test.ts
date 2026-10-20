import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

const MINUTE = 60_000;

describe('device.snapshot', () => {
  it('remembers the writable controls that exist, by device', () => {
    home.write(home.lampA, 'power', true);
    home.write(home.lampA, 'brightness', 40);
    home.write(home.lampB, 'power', false);
    const { outputs } = home.read('device.snapshot', {
      target: { devices: [home.lampA.id, home.lampB.id] },
      controls: ['power', 'brightness', 'color'],
    });
    expect(outputs['snapshot']).toEqual({
      [home.lampA.id]: { power: true, brightness: 40 },
      [home.lampB.id]: { power: false },
    });
  });

  it('leaves out read-only controls and fails when nothing can be remembered', () => {
    home.write(home.sensor, 'temperature', 21);
    expect(() =>
      home.read('device.snapshot', {
        target: { device: home.sensor.id },
        controls: ['temperature'],
      }),
    ).toThrow(/None of the devices/);
  });

  it('rejects a control a device cannot have', () => {
    expect(() =>
      home.read('device.snapshot', { target: { device: home.lampA.id }, controls: ['nonsense'] }),
    ).toThrow(/not a control/);
  });
});

describe('state.window_stats', () => {
  it('summarises the recent window', () => {
    const start = home.clock.current.getTime();
    home.write(home.sensor, 'temperature', 20, new Date(start - 8 * MINUTE).toISOString());
    home.write(home.sensor, 'temperature', 22, new Date(start - 4 * MINUTE).toISOString());
    home.write(home.sensor, 'temperature', 24, new Date(start - 1 * MINUTE).toISOString());
    home.write(home.sensor, 'temperature', 99, new Date(start - 30 * MINUTE).toISOString());
    const { outputs } = home.read('state.window_stats', {
      device: { device: home.sensor.id },
      control: 'temperature',
      window: 10 * MINUTE,
    });
    expect(outputs).toMatchObject({ average: 22, min: 20, max: 24, count: 3 });
    expect(outputs['rate']).toBeCloseTo((4 / 7) * 60, 5);
  });

  it('reports an empty window as a count of zero only', () => {
    const { outputs } = home.read('state.window_stats', {
      device: { device: home.sensor.id },
      control: 'temperature',
      window: MINUTE,
    });
    expect(outputs).toEqual({ count: 0 });
  });
});

describe('state.compare_past', () => {
  beforeEach(() => {
    home.write(home.sensor, 'temperature', 18, '2026-10-17T11:00:00.000Z');
    home.write(home.sensor, 'temperature', 19, '2026-10-18T11:30:00.000Z');
    home.write(home.sensor, 'temperature', 22, '2026-10-18T11:50:00.000Z');
  });

  const compare = (inputs: Record<string, string | number>): ReturnType<Home['read']> =>
    home.read('state.compare_past', {
      device: { device: home.sensor.id },
      control: 'temperature',
      ...inputs,
    });

  it('compares with a while ago', () => {
    expect(compare({ mode: 'ago', ago: 20 * MINUTE }).outputs).toEqual({
      current: 22,
      earlier: 19,
      change: 3,
    });
  });

  it('compares with the same time yesterday', () => {
    expect(compare({ mode: 'yesterday' }).outputs).toEqual({
      current: 22,
      earlier: 18,
      change: 4,
    });
  });

  it('gives only the current value when there was no earlier one', () => {
    expect(compare({ mode: 'last_week' }).outputs).toEqual({ current: 22 });
  });

  it('refuses a look back without a time', () => {
    expect(() => compare({ mode: 'ago' })).toThrow(/needs a time to look back/);
  });
});
