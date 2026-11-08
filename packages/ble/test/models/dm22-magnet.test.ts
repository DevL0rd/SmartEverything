import { MODEL_SPEC, specSignalProblems } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { XIAOMI_MAGNET_DW2HL_MODEL as MAGNET } from '../../src/xiaomi-magnet-model';
import { XIAOMI_MAGNET_MODEL } from '../../src/xiaomi-magnet';

function box(id: string): {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
} {
  const geometry = MAGNET.parts.find((part) => part.id === id)?.geometry;
  if (geometry?.type !== 'roundedBox') throw new Error(`${id} is not a box`);
  return {
    width: Number(geometry.width),
    height: Number(geometry.height),
    depth: Number(geometry.depth),
  };
}

describe('Xiaomi Door and Window Sensor 2 model', () => {
  it('is a valid spec with known signals and the live model string as alias', () => {
    expect(MODEL_SPEC.safeParse(MAGNET).success).toBe(true);
    expect(specSignalProblems(MAGNET)).toEqual([]);
    expect(MAGNET.meta?.aliases).toEqual([XIAOMI_MAGNET_MODEL]);
  });

  it('draws the sensor at the published 34.0 x 32.7 x 14.5 mm', () => {
    expect(box('sensor')).toEqual({ width: 0.034, height: 0.0327, depth: 0.0145 });
  });

  it('moves the magnet away from the sensor when the door opens', () => {
    const gap = MAGNET.channels?.find((channel) => channel.id === 'magnetGap');
    expect(gap).toMatchObject({ target: 'magnet', property: 'translate', source: 'door' });
    expect(gap?.map).toMatchObject({ type: 'enum', table: { closed: 0 } });
    const open = gap?.map.type === 'enum' ? gap.map.table['open'] : undefined;
    expect(Number(open)).toBeGreaterThan(0.005);
  });

  it('moves the sensor the opposite way so the open pair stays centred', () => {
    const sensor = MAGNET.channels?.find((channel) => channel.id === 'sensorGap');
    const magnet = MAGNET.channels?.find((channel) => channel.id === 'magnetGap');
    const shift = (entry: typeof sensor): number =>
      entry?.map.type === 'enum' ? Number(entry.map.table['open']) : 0;
    expect(shift(sensor)).toBeCloseTo(-shift(magnet));
  });

  it('opens with a shot on the magnet and lists a state for each door position', () => {
    expect(MAGNET.shots?.[0]).toMatchObject({ focus: 'magnet' });
    expect(Object.keys(MAGNET.states ?? {})).toEqual(
      expect.arrayContaining(['closed', 'open', 'offline']),
    );
  });
});
