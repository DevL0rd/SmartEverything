import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReadInputs } from '../../../src/automations/world-v3/read-port';
import { furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
  home.write(home.lampA, 'brightness', 10, '2026-10-18T06:00:00.000Z');
  home.write(home.lampA, 'brightness', 30, '2026-10-18T09:00:00.000Z');
  home.write(home.lampA, 'brightness', 50, '2026-10-18T10:00:00.000Z');
  home.write(home.lampA, 'brightness', 20, '2026-10-18T11:00:00.000Z');
  home.write(home.lampA, 'power', false, '2026-10-18T06:00:00.000Z');
  home.write(home.lampA, 'power', true, '2026-10-18T09:00:00.000Z');
  home.write(home.lampA, 'power', false, '2026-10-18T10:30:00.000Z');
});

afterEach(async () => {
  await home.test.close();
});

const HOUR = 3_600_000;

function history(inputs: ReadInputs): ReturnType<Home['read']> {
  return home.read('state.history', {
    device: { device: home.lampA.id },
    control: 'brightness',
    ...inputs,
  });
}

describe('state.history', () => {
  it('reads the points of the last stretch with their statistics', () => {
    const { outputs } = history({ last: 3 * HOUR });
    expect(outputs).toEqual({
      points: [
        { at: '2026-10-18T09:00:00.000Z', value: 30 },
        { at: '2026-10-18T10:00:00.000Z', value: 50 },
        { at: '2026-10-18T11:00:00.000Z', value: 20 },
      ],
      average: 100 / 3,
      min: 20,
      max: 50,
      change: -10,
      count: 3,
    });
  });

  it('reads between two moments and leaves the end moment out', () => {
    const { outputs } = history({
      from: '2026-10-18T06:00:00.000Z',
      to: '2026-10-18T10:00:00.000Z',
    });
    expect(outputs).toMatchObject({ count: 2, min: 10, max: 30, change: 20 });
  });

  it('leaves the statistics out when there are no numbers', () => {
    expect(history({ last: 60_000 }).outputs).toEqual({ points: [], count: 0 });
    const flags = history({ control: 'power', last: 6 * HOUR });
    expect(flags.outputs).toMatchObject({ count: 3 });
    expect('average' in flags.outputs).toBe(false);
  });

  it('measures the time a control held a value, counting the value it carried into the range', () => {
    const held = home.read('state.history', {
      device: { device: home.lampA.id },
      control: 'power',
      from: '2026-10-18T09:30:00.000Z',
      stateEquals: true,
    });
    expect(held.outputs['timeIn']).toBe(HOUR);
    const all = home.read('state.history', {
      device: { device: home.lampA.id },
      control: 'power',
      last: 6 * HOUR,
      stateEquals: true,
    });
    expect(all.outputs['timeIn']).toBe(1.5 * HOUR);
    const off = home.read('state.history', {
      device: { device: home.lampA.id },
      control: 'power',
      last: 6 * HOUR,
      stateEquals: false,
    });
    expect(off.outputs['timeIn']).toBe(4.5 * HOUR);
  });

  it('needs a look-back time or a start moment, and not both', () => {
    expect(() => history({})).toThrow(/look-back time or a start moment/);
    expect(() => history({ last: HOUR, from: '2026-10-18T09:00:00.000Z' })).toThrow(/not both/);
    expect(() => history({ from: '2026-10-18T13:00:00.000Z' })).toThrow(/ends before it starts/);
  });

  it('refuses a sampled control, a control the device lacks and a bad moment', () => {
    const [sampled] = home.test.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'link-1',
        parentId: null,
        kind: 'router',
        name: 'Link',
        model: 'm',
        manufacturer: 'm',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [
          {
            key: 'latency',
            label: 'Latency',
            access: 'read',
            value: { kind: 'number', min: 0, max: 1000, step: 1 },
          },
        ],
        details: {},
      },
    ]);
    expect(() =>
      home.read('state.history', {
        device: { device: sampled?.id ?? '' },
        control: 'latency',
        last: HOUR,
      }),
    ).toThrow(/sampled/);
    expect(() => history({ control: 'oscillation', last: HOUR })).toThrow(
      expect.objectContaining({ errorClass: 'NotFound' }),
    );
    expect(() => history({ from: 'yesterday' })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
  });
});
