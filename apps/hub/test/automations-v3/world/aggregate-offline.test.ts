import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { JsonValue } from '@smarteverything/domain';
import { furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
  home.write(home.lampA, 'power', true);
  home.write(home.lampB, 'power', true);
  home.write(home.lampC, 'power', true);
  home.write(home.lampA, 'brightness', 80);
  home.write(home.lampB, 'brightness', 20);
});

afterEach(async () => {
  await home.test.close();
});

function across(
  devices: readonly string[],
  fn: string,
  matches?: JsonValue,
  control = 'power',
): ReturnType<Home['read']> {
  return home.read('device.aggregate', {
    target: { devices },
    control,
    fn,
    ...(matches === undefined ? {} : { matches }),
  });
}

describe('device.aggregate with an offline device', () => {
  it('does not count an offline light as on', () => {
    const only = across([home.lampC.id], 'any', true);
    expect(only.outputs).toMatchObject({ value: false, count: 0, matching: [] });
    expect(across([home.lampC.id], 'count', true).outputs['value']).toBe(0);
  });

  it('lists the offline devices it left out', () => {
    const mixed = across([home.lampA.id, home.lampC.id], 'count', true);
    expect(mixed.outputs).toMatchObject({
      value: 1,
      matching: [{ device: home.lampA.id }],
      offline: [{ device: home.lampC.id }],
    });
  });

  it('says none are on when only offline lights are left over', () => {
    expect(across([home.lampC.id], 'none', true).outputs['value']).toBe(true);
    expect(across([home.lampA.id, home.lampC.id], 'all', true).outputs['value']).toBe(true);
  });

  it('leaves offline devices out of the average, the lowest and the sum', () => {
    home.write(home.lampB, 'brightness', 20);
    const online = [home.lampA.id, home.lampB.id];
    expect(across(online, 'average', undefined, 'brightness').outputs).toMatchObject({
      value: 50,
      offline: [],
    });
    expect(
      across([...online, home.lampC.id], 'sum', undefined, 'brightness').outputs,
    ).toMatchObject({ value: 100, count: 2 });
  });

  it('reports an empty offline list when every device is online', () => {
    expect(across([home.lampA.id], 'any', true).outputs['offline']).toEqual([]);
  });
});
